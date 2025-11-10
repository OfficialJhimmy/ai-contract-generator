"""
AI Contract Generator - Optimized Lambda Handler
Production-grade implementation with streaming optimizations
"""

import json
import os
import traceback
from datetime import datetime
from typing import Dict, Any, Optional
import boto3
from anthropic import Anthropic, APIError, RateLimitError, APIConnectionError

# Initialize clients
anthropic_client = None
ssm_client = boto3.client('ssm')

# Cache for API key
_api_key_cache = None

# Constants - OPTIMIZED
MAX_RETRIES = 2
RETRY_DELAY = 1
MODEL = "claude-sonnet-4-5-20250929"
MAX_TOKENS = 4000  # Reduced for faster initial response
CHUNK_SIZE = 100  # Smaller chunks for faster perceived speed


def get_api_key() -> str:
    """Retrieve Anthropic API key with caching"""
    global _api_key_cache
    
    if _api_key_cache:
        return _api_key_cache
    
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if api_key:
        _api_key_cache = api_key
        return api_key
    
    try:
        param_name = os.environ.get('ANTHROPIC_API_KEY_PARAM', '/contract-generator/anthropic-api-key')
        response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
        _api_key_cache = response['Parameter']['Value']
        return _api_key_cache
    except Exception as e:
        print(f"Error retrieving API key from SSM: {str(e)}")
        raise ValueError("Could not retrieve Anthropic API key")


def get_anthropic_client() -> Anthropic:
    """Get or create Anthropic client"""
    global anthropic_client
    
    if anthropic_client is None:
        api_key = get_api_key()
        try:
            anthropic_client = Anthropic(
                api_key=api_key,
                max_retries=1,
                timeout=60.0
            )
            print("Anthropic client initialized")
        except Exception as e:
            print(f"Error initializing Anthropic client: {str(e)}")
            raise
    
    return anthropic_client


def build_contract_prompt(user_input: str, target_pages: int = 10) -> tuple:
    """
    Build optimized prompt for faster generation
    """
    system_prompt = """You are an expert legal contract generator. Generate comprehensive, professionally formatted contracts in clean HTML.

CRITICAL REQUIREMENTS:
1. Start generating IMMEDIATELY - begin with the contract title
2. Generate a COMPLETE contract - ALL sections must be included
3. Prioritize COMPLETENESS over excessive detail in any one section
4. Use proper legal structure and terminology
5. Output ONLY valid HTML - no markdown, no explanations
6. Use semantic HTML: <h1>, <h2>, <h3>, <p>, <ol>, <ul>
7. Include inline CSS for professional styling
8. Make it print-ready

MANDATORY STRUCTURE - YOU MUST COMPLETE ALL SECTIONS:
1. Document Title and Header
2. Parties to the Agreement
3. Recitals/Background
4. Definitions (10-15 key terms)
5. Scope of Services/Products
6. Payment Terms
7. Term and Termination
8. Intellectual Property Rights
9. Confidentiality
10. Warranties and Representations
11. Limitation of Liability
12. Indemnification
13. Dispute Resolution
14. Governing Law and Jurisdiction
15. General Provisions:
    - Assignment
    - Notices
    - Severability
    - Entire Agreement
    - Amendments
    - Waiver
    - Force Majeure
16. Signature Blocks (MUST END WITH THIS)

WRITING GUIDELINES:
- Be concise but complete in each section
- Use standard legal language
- Aim for 3,000-4,000 words total
- CRITICAL: Ensure you reach the Signature Blocks at the end
- Do not stop early - complete the entire document

STYLING:
- Professional typography (serif fonts)
- Proper spacing and margins
- Clear section numbering
- Black text, white background

START GENERATING IMMEDIATELY with the HTML."""

    user_prompt = f"""Generate a legal contract: {user_input}

Target length: ~{target_pages} pages ({target_pages * 500} words)

CRITICAL INSTRUCTIONS:
- Generate ALL 16 sections listed in the system prompt
- Be thorough but concise to ensure completeness
- MUST end with Signature Blocks
- Do not stop before completing all sections

Begin the HTML NOW:"""

    return system_prompt, user_prompt


def generate_contract_streaming(prompt: str, target_pages: int = 10) -> Dict[str, Any]:
    """
    Generate contract with optimized streaming
    Returns generator for streaming chunks
    """
    client = get_anthropic_client()
    system_prompt, user_prompt = build_contract_prompt(prompt, target_pages)
    
    try:
        # Use streaming with immediate start
        stream = client.messages.stream(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            temperature=0.7,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": user_prompt
            }]
        )
        
        return stream
        
    except Exception as e:
        print(f"Error in generate_contract_streaming: {str(e)}")
        raise


def validate_input(prompt: str) -> Optional[str]:
    """Validate user input"""
    if not prompt or not prompt.strip():
        return "Prompt cannot be empty"
    
    if len(prompt.strip()) < 5:
        return "Prompt is too short. Please provide more details."
    
    if len(prompt) > 5000:
        return "Prompt is too long. Please limit to 5000 characters."
    
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler - for REST API
    """
    print(f"Received event: {json.dumps(event)}")
    
    try:
        if 'body' in event:
            if isinstance(event['body'], str):
                body = json.loads(event['body'])
            else:
                body = event['body']
        else:
            body = event
        
        prompt = body.get('prompt', '').strip()
        target_pages = body.get('target_pages', 10)
        
        validation_error = validate_input(prompt)
        if validation_error:
            return create_response(400, {
                'error': validation_error,
                'type': 'validation_error'
            })
        
        print(f"Generating contract for prompt: {prompt[:100]}...")
        
        # For REST API, we collect all chunks
        full_content = ""
        stream = generate_contract_streaming(prompt, target_pages)
        
        with stream as s:
            for text in s.text_stream:
                full_content += text
        
        if not full_content or len(full_content) < 100:
            raise ValueError("Generated contract is too short")
        
        print(f"Successfully generated contract: {len(full_content)} characters")
        
        return create_response(200, {
            'content': full_content,
            'metadata': {
                'model': MODEL,
                'length': len(full_content),
                'timestamp': datetime.utcnow().isoformat()
            }
        })
    
    except ValueError as e:
        print(f"Validation error: {str(e)}")
        return create_response(400, {
            'error': str(e),
            'type': 'validation_error'
        })
    
    except RateLimitError as e:
        print(f"Rate limit error: {str(e)}")
        return create_response(429, {
            'error': 'Service is currently busy. Please try again.',
            'type': 'rate_limit_error',
            'retry_after': 60
        })
    
    except APIError as e:
        print(f"API error: {str(e)}")
        return create_response(502, {
            'error': 'Error communicating with AI service.',
            'type': 'api_error'
        })
    
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        print(traceback.format_exc())
        return create_response(500, {
            'error': 'An unexpected error occurred.',
            'type': 'internal_error',
            'details': str(e) if os.environ.get('DEBUG') else None
        })


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Create standardized API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        'body': json.dumps(body, default=str)
    }