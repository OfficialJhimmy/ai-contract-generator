"""
AI Contract Generator - Lambda Handler
Handles contract generation with streaming support
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

# Constants
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
MODEL = "claude-sonnet-4-5-20250929"  # Latest Claude model
MAX_TOKENS = 6000  # Large enough for 10+ page contracts


def get_api_key() -> str:
    """
    Retrieve Anthropic API key from environment or SSM Parameter Store
    Implements caching for performance
    """
    global _api_key_cache
    
    if _api_key_cache:
        return _api_key_cache
    
    # Try environment variable first (for local testing)
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if api_key:
        _api_key_cache = api_key
        return api_key
    
    # Fall back to SSM Parameter Store
    try:
        param_name = os.environ.get('ANTHROPIC_API_KEY_PARAM', '/contract-generator/anthropic-api-key')
        response = ssm_client.get_parameter(
            Name=param_name,
            WithDecryption=True
        )
        _api_key_cache = response['Parameter']['Value']
        return _api_key_cache
    except Exception as e:
        print(f"Error retrieving API key from SSM: {str(e)}")
        raise ValueError("Could not retrieve Anthropic API key")


# def get_anthropic_client() -> Anthropic:
#     """
#     Get or create Anthropic client with proper error handling
#     """
#     global anthropic_client
    
#     if anthropic_client is None:
#         api_key = get_api_key()
#         anthropic_client = Anthropic(api_key=api_key)
    
#     return anthropic_client

def get_anthropic_client() -> Anthropic:
    """
    Get or create Anthropic client with proper error handling
    """
    global anthropic_client
    
    if anthropic_client is None:
        api_key = get_api_key()
        try:
            # Initialize with minimal parameters to avoid httpx compatibility issues
            anthropic_client = Anthropic(
                api_key=api_key,
                max_retries=2,
                timeout=300.0
            )
            print("Anthropic client initialized successfully")
        except Exception as e:
            print(f"Error initializing Anthropic client: {str(e)}")
            raise
    
    return anthropic_client


def build_contract_prompt(user_input: str) -> str:
    """
    Build a comprehensive prompt for contract generation
    This is crucial - good prompts = good contracts
    """
    system_prompt = """You are an expert legal contract generator. Generate comprehensive, professionally formatted contracts in clean HTML.

CRITICAL REQUIREMENTS:
1. The contract MUST be at least 10 pages when printed (approximately 5000+ words)
2. Use proper legal structure and terminology
3. Include ALL standard contract sections
4. Output ONLY valid HTML - no markdown, no explanations
5. Use semantic HTML tags: <h1>, <h2>, <h3>, <p>, <ol>, <ul>, <section>
6. Include inline CSS for professional styling
7. Make it print-ready with proper spacing and typography

REQUIRED SECTIONS (expand each thoroughly):
1. Title and Header
2. Parties to the Agreement (with full details)
3. Recitals/Background
4. Definitions (comprehensive list)
5. Scope of Services/Products
6. Terms and Conditions (detailed)
7. Payment Terms
8. Intellectual Property Rights
9. Confidentiality
10. Warranties and Representations
11. Limitation of Liability
12. Indemnification
13. Term and Termination
14. Dispute Resolution
15. Governing Law and Jurisdiction
16. Force Majeure
17. General Provisions (Assignment, Notices, Severability, etc.)
18. Signature Blocks

STYLING REQUIREMENTS:
- Professional typography (serif fonts for legal documents)
- Proper spacing and margins
- Clear section numbering
- Print-friendly (black text, white background)
- Responsive design

Generate a complete, enforceable contract that any business could actually use."""

    user_prompt = f"""Generate a comprehensive legal contract based on this description:

{user_input}

Remember: 
- Minimum 10 pages (5000+ words)
- Complete HTML with inline CSS
- All required sections thoroughly developed
- Professional legal language
- Print-ready formatting

Begin the HTML now:"""

    return system_prompt, user_prompt


def generate_contract_streaming(prompt: str) -> Dict[str, Any]:
    """
    Generate contract using Claude with streaming
    Returns complete HTML content with error handling
    """
    client = get_anthropic_client()
    system_prompt, user_prompt = build_contract_prompt(prompt)
    
    retry_count = 0
    last_error = None
    
    while retry_count < MAX_RETRIES:
        try:
            # Stream the response from Claude
            full_content = ""
            
            with client.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                temperature=0.7,  # Slight creativity for legal language variety
                system=system_prompt,
                messages=[{
                    "role": "user",
                    "content": user_prompt
                }]
            ) as stream:
                for text in stream.text_stream:
                    full_content += text
            
            # Validate we got content
            if not full_content or len(full_content) < 1000:
                raise ValueError("Generated contract is too short")
            
            # Validate it's HTML
            if not ('<html' in full_content.lower() or '<div' in full_content.lower()):
                # Wrap in HTML if Claude didn't provide full HTML
                full_content = wrap_in_html(full_content)
            
            print(f"Successfully generated contract: {len(full_content)} characters")
            
            return {
                'success': True,
                'content': full_content,
                'metadata': {
                    'model': MODEL,
                    'length': len(full_content),
                    'timestamp': datetime.utcnow().isoformat()
                }
            }
            
        except RateLimitError as e:
            last_error = e
            retry_count += 1
            print(f"Rate limit hit, retry {retry_count}/{MAX_RETRIES}: {str(e)}")
            if retry_count < MAX_RETRIES:
                import time
                time.sleep(RETRY_DELAY * retry_count)  # Exponential backoff
            continue
            
        except APIConnectionError as e:
            last_error = e
            retry_count += 1
            print(f"Connection error, retry {retry_count}/{MAX_RETRIES}: {str(e)}")
            if retry_count < MAX_RETRIES:
                import time
                time.sleep(RETRY_DELAY)
            continue
            
        except APIError as e:
            # Don't retry on client errors (400-level)
            print(f"API error: {str(e)}")
            raise
            
        except Exception as e:
            print(f"Unexpected error: {str(e)}")
            print(traceback.format_exc())
            raise
    
    # If we exhausted retries
    raise Exception(f"Failed after {MAX_RETRIES} retries. Last error: {str(last_error)}")


def wrap_in_html(content: str) -> str:
    """
    Wrap content in proper HTML structure if needed
    """
    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Legal Contract</title>
    <style>
        body {{
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.6;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 1in;
            color: #000;
            background: #fff;
        }}
        h1 {{
            text-align: center;
            font-size: 24pt;
            margin-bottom: 0.5in;
            text-transform: uppercase;
        }}
        h2 {{
            font-size: 16pt;
            margin-top: 0.3in;
            margin-bottom: 0.2in;
            border-bottom: 1px solid #000;
        }}
        h3 {{
            font-size: 14pt;
            margin-top: 0.2in;
            margin-bottom: 0.15in;
        }}
        p {{
            text-align: justify;
            margin-bottom: 0.15in;
        }}
        ol, ul {{
            margin-bottom: 0.15in;
        }}
        li {{
            margin-bottom: 0.1in;
        }}
        .signature-block {{
            margin-top: 1in;
            page-break-inside: avoid;
        }}
        @media print {{
            body {{
                padding: 0;
            }}
        }}
    </style>
</head>
<body>
{content}
</body>
</html>"""
    return html_template


def validate_input(prompt: str) -> Optional[str]:
    """
    Validate user input before processing
    Returns error message if invalid, None if valid
    """
    if not prompt or not prompt.strip():
        return "Prompt cannot be empty"
    
    if len(prompt.strip()) < 10:
        return "Prompt is too short. Please provide more details about your contract needs."
    
    if len(prompt) > 5000:
        return "Prompt is too long. Please limit to 5000 characters."
    
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler
    Supports both API Gateway and direct invocation
    """
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Parse request body
        if 'body' in event:
            # API Gateway event
            if isinstance(event['body'], str):
                body = json.loads(event['body'])
            else:
                body = event['body']
        else:
            # Direct invocation
            body = event
        
        # Extract prompt
        prompt = body.get('prompt', '').strip()
        
        # Validate input
        validation_error = validate_input(prompt)
        if validation_error:
            return create_response(400, {
                'error': validation_error,
                'type': 'validation_error'
            })
        
        # Generate contract
        print(f"Generating contract for prompt: {prompt[:100]}...")
        result = generate_contract_streaming(prompt)
        
        if result['success']:
            return create_response(200, {
                'content': result['content'],
                'metadata': result['metadata']
            })
        else:
            return create_response(500, {
                'error': 'Contract generation failed',
                'type': 'generation_error'
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
            'error': 'Service is currently busy. Please try again in a moment.',
            'type': 'rate_limit_error',
            'retry_after': 60
        })
    
    except APIError as e:
        print(f"API error: {str(e)}")
        return create_response(502, {
            'error': 'Error communicating with AI service. Please try again.',
            'type': 'api_error'
        })
    
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        print(traceback.format_exc())
        return create_response(500, {
            'error': 'An unexpected error occurred. Please try again.',
            'type': 'internal_error',
            'details': str(e) if os.environ.get('DEBUG') else None
        })


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create standardized API Gateway response with proper CORS headers
    """
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Content-Type-Options': 'nosniff'
        },
        'body': json.dumps(body, default=str)
    }