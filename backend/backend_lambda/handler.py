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
MAX_TOKENS = 16000  # Reduced for faster initial response
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




# """
# AI Contract Generator - Production-Grade Lambda Handler
# Optimized for complete contract generation with clean HTML output
# """

# import json
# import os
# import re
# import traceback
# from datetime import datetime
# from typing import Dict, Any, Optional, Tuple
# import boto3
# from anthropic import Anthropic, APIError, RateLimitError, APIConnectionError

# # Initialize clients
# anthropic_client = None
# ssm_client = boto3.client('ssm')

# # Cache for API key
# _api_key_cache = None

# # Constants - Optimized for completeness and speed
# MAX_RETRIES = 2
# RETRY_DELAY = 1
# MODEL = "claude-sonnet-4-5-20250929"  # Stable, reliable model
# MAX_TOKENS = 4000  # Large enough for complete contracts
# TEMPERATURE = 0.4  # Lower = more focused, completes faster
# CHUNK_SIZE = 100 


# def get_api_key() -> str:
#     """Retrieve Anthropic API key with caching"""
#     global _api_key_cache
    
#     if _api_key_cache:
#         return _api_key_cache
    
#     api_key = os.environ.get('ANTHROPIC_API_KEY')
#     if api_key:
#         _api_key_cache = api_key
#         return api_key
    
#     try:
#         param_name = os.environ.get('ANTHROPIC_API_KEY_PARAM', '/contract-generator/anthropic-api-key')
#         response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
#         _api_key_cache = response['Parameter']['Value']
#         return _api_key_cache
#     except Exception as e:
#         print(f"Error retrieving API key from SSM: {str(e)}")
#         raise ValueError("Could not retrieve Anthropic API key")


# def get_anthropic_client() -> Anthropic:
#     """Get or create Anthropic client with proper configuration"""
#     global anthropic_client
    
#     if anthropic_client is None:
#         api_key = get_api_key()
#         try:
#             anthropic_client = Anthropic(
#                 api_key=api_key,
#                 max_retries=2,
#                 timeout=300.0  # 5 minutes for long generations
#             )
#             print("✅ Anthropic client initialized")
#         except Exception as e:
#             print(f"❌ Error initializing Anthropic client: {str(e)}")
#             raise
    
#     return anthropic_client


# def build_contract_prompt(user_input: str, target_pages: int = 10) -> Tuple[str, str]:
#     """
#     Build optimized prompt for COMPLETE contract generation
#     Returns clean HTML without inline styles (for better frontend control)
#     """
    
#     system_prompt = """You are an expert legal contract generator. Your PRIMARY goal is to generate COMPLETE, professionally formatted contracts.

# CRITICAL REQUIREMENTS:
# 1. Start generating IMMEDIATELY - begin with the contract title
# 2. Generate a COMPLETE contract with ALL sections (no stopping early)
# 3. Prioritize COMPLETENESS over verbosity - finish all sections
# 4. Be thorough but concise to ensure you complete the document
# 5. Use proper legal structure and precise terminology
# 6. Output ONLY semantic HTML - NO inline CSS, NO <style> tags, NO markdown
# 7. Use ONLY these HTML tags: <h1>, <h2>, <h3>, <p>, <ol>, <ul>, <li>, <section>, <strong>, <em>
# 8. Do NOT include: <html>, <head>, <body>, <style>, or any style attributes
# 9. Start directly with <h1> for the contract title
# 10. Make it print-ready

# MANDATORY STRUCTURE - COMPLETE ALL 16 SECTIONS:
# 1. Document Title (h1)
# 2. Parties to the Agreement (h2, then paragraphs)
# 3. Recitals/Background (h2, 2-3 paragraphs)
# 4. Definitions (h2, then ordered list with 10-15 terms)
# 5. Scope of Services/Products (h2, detailed paragraphs)
# 6. Payment Terms (h2, clear specifics)
# 7. Term and Termination (h2, conditions and procedures)
# 8. Intellectual Property Rights (h2, comprehensive)
# 9. Confidentiality (h2, mutual obligations)
# 10. Warranties and Representations (h2, both parties)
# 11. Limitation of Liability (h2, caps and exclusions)
# 12. Indemnification (h2, mutual provisions)
# 13. Dispute Resolution (h2, arbitration/mediation)
# 14. Governing Law and Jurisdiction (h2, specify location)
# 15. General Provisions (h2 with h3 subsections):
#     - Assignment (h3)
#     - Notices (h3)
#     - Severability (h3)
#     - Entire Agreement (h3)
#     - Amendments (h3)
#     - Waiver (h3)
#     - Force Majeure (h3)
# 16. Signature Blocks (h2, MUST END WITH THIS)

# WRITING STYLE:
# - Be concise but complete in each section
# - Use standard legal language and terminology
# - Target 3,500-4,500 words total
# - Each section should be substantial but not overly verbose
# - CRITICAL: Complete ALL sections - do not stop before Signature Blocks
# - Use numbered/bulleted lists where appropriate

# HTML STRUCTURE EXAMPLE:
# <h1>TERMS OF SERVICE AGREEMENT</h1>
# <section>
#   <h2>1. PARTIES TO THE AGREEMENT</h2>
#   <p>This Agreement is entered into...</p>
# </section>
# <section>
#   <h2>2. RECITALS</h2>
#   <p>WHEREAS...</p>
# </section>
# ...continue through all 16 sections...
# <section>
#   <h2>16. SIGNATURE BLOCKS</h2>
#   <p>IN WITNESS WHEREOF...</p>
# </section>

# CRITICAL: You MUST complete ALL 16 sections. Generate clean semantic HTML with NO styling."""

#     target_words = max(3500, target_pages * 400)
    
#     user_prompt = f"""Generate a complete, enforceable legal contract for:

# {user_input}

# Requirements:
# - Target: ~{target_pages} pages ({target_words} words)
# - Generate ALL 16 sections from the system prompt
# - Be thorough but concise to ensure completion
# - MUST end with Signature Blocks section
# - Use ONLY semantic HTML tags (no styles)

# Begin generating the contract now with <h1> title:"""

#     return system_prompt, user_prompt


# def clean_generated_html(html_content: str) -> str:
#     """
#     Clean generated HTML to remove any styling that interferes with frontend
#     """
#     cleaned = html_content
    
#     # Remove <!DOCTYPE> declarations
#     cleaned = re.sub(r'<!DOCTYPE[^>]*>', '', cleaned, flags=re.IGNORECASE)
    
#     # Remove <html>, <head>, <body> tags
#     cleaned = re.sub(r'</?html[^>]*>', '', cleaned, flags=re.IGNORECASE)
#     cleaned = re.sub(r'</?head[^>]*>', '', cleaned, flags=re.IGNORECASE)
#     cleaned = re.sub(r'</?body[^>]*>', '', cleaned, flags=re.IGNORECASE)
    
#     # Remove all <style> tags and their content
#     cleaned = re.sub(r'<style[^>]*>.*?</style>', '', cleaned, flags=re.IGNORECASE | re.DOTALL)
    
#     # Remove all inline style attributes
#     cleaned = re.sub(r'\s*style\s*=\s*["\'][^"\']*["\']', '', cleaned, flags=re.IGNORECASE)
    
#     # Remove any other unwanted tags
#     cleaned = re.sub(r'</?meta[^>]*>', '', cleaned, flags=re.IGNORECASE)
#     cleaned = re.sub(r'</?link[^>]*>', '', cleaned, flags=re.IGNORECASE)
#     cleaned = re.sub(r'</?title[^>]*>', '', cleaned, flags=re.IGNORECASE)
    
#     # Clean up multiple newlines/whitespace
#     cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
    
#     return cleaned.strip()


# def ensure_html_complete(html_content: str) -> str:
#     """
#     Ensure HTML is complete with all required sections
#     Adds missing Signature Blocks if contract was cut off
#     """
#     # Check if contract has signature section
#     has_signature = re.search(r'<h2[^>]*>.*?signature.*?</h2>', html_content, re.IGNORECASE)
    
#     if not has_signature:
#         print("⚠️  Missing Signature Blocks - adding...")
        
#         # Add signature section
#         signature_section = """
# <section>
# <h2>16. SIGNATURE BLOCKS</h2>
# <p>IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.</p>

# <p><strong>PARTY A:</strong></p>
# <p>_________________________________<br>
# Name:<br>
# Title:<br>
# Date:</p>

# <p><strong>PARTY B:</strong></p>
# <p>_________________________________<br>
# Name:<br>
# Title:<br>
# Date:</p>
# </section>
# """
#         html_content += signature_section
    
#     # Close any unclosed tags
#     open_tags = []
#     for match in re.finditer(r'<(\w+)[^>]*>', html_content):
#         tag = match.group(1).lower()
#         if tag not in ['br', 'hr', 'img', 'input', 'meta', 'link']:
#             open_tags.append(tag)
    
#     for match in re.finditer(r'</(\w+)>', html_content):
#         tag = match.group(1).lower()
#         if tag in open_tags:
#             open_tags.remove(tag)
    
#     # Close remaining open tags in reverse order
#     for tag in reversed(open_tags):
#         html_content += f'</{tag}>'
#         print(f"  Closed tag: </{tag}>")
    
#     return html_content


# def validate_contract_quality(html_content: str, stop_reason: str) -> Dict[str, Any]:
#     """
#     Validate the generated contract quality
#     Returns quality metrics and warnings
#     """
#     # Count sections
#     h2_count = len(re.findall(r'<h2[^>]*>.*?</h2>', html_content, re.IGNORECASE))
    
#     # Check for signature blocks
#     has_signature = bool(re.search(r'signature.*?block', html_content, re.IGNORECASE))
    
#     # Estimate word count
#     text_content = re.sub(r'<[^>]+>', '', html_content)
#     word_count = len(text_content.split())
    
#     # Check completeness
#     is_complete = (
#         stop_reason != 'max_tokens' and
#         has_signature and
#         h2_count >= 12 and
#         word_count >= 3000
#     )
    
#     quality = {
#         'is_complete': is_complete,
#         'has_signature': has_signature,
#         'section_count': h2_count,
#         'word_count': word_count,
#         'estimated_pages': round(word_count / 400, 1),
#         'stop_reason': stop_reason,
#         'warnings': []
#     }
    
#     # Add warnings
#     if stop_reason == 'max_tokens':
#         quality['warnings'].append('Hit token limit - may be incomplete')
#     if not has_signature:
#         quality['warnings'].append('Missing signature blocks')
#     if h2_count < 12:
#         quality['warnings'].append(f'Only {h2_count} sections (expected 16)')
#     if word_count < 3000:
#         quality['warnings'].append(f'Contract short: {word_count} words')
    
#     return quality


# def generate_contract_streaming(prompt: str, target_pages: int = 10) -> Dict[str, Any]:
#     """
#     Generate complete contract using Claude
#     Returns clean HTML optimized for frontend display
#     """
#     client = get_anthropic_client()
#     system_prompt, user_prompt = build_contract_prompt(prompt, target_pages)
    
#     retry_count = 0
#     last_error = None
    
#     while retry_count < MAX_RETRIES:
#         try:
#             full_content = ""
            
#             print(f"🚀 Starting generation:")
#             print(f"   Model: {MODEL}")
#             print(f"   Max tokens: {MAX_TOKENS}")
#             print(f"   Temperature: {TEMPERATURE}")
#             print(f"   Target pages: {target_pages}")
            
#             # Stream the response from Claude
#             with client.messages.stream(
#                 model=MODEL,
#                 max_tokens=MAX_TOKENS,
#                 temperature=TEMPERATURE,
#                 system=system_prompt,
#                 messages=[{
#                     "role": "user",
#                     "content": user_prompt
#                 }]
#             ) as stream:
#                 for text in stream.text_stream:
#                     full_content += text
            
#             # Get final message info
#             final_message = stream.get_final_message()
#             stop_reason = final_message.stop_reason
#             usage = final_message.usage
            
#             print(f"✅ Generation completed:")
#             print(f"   Stop reason: {stop_reason}")
#             print(f"   Raw length: {len(full_content)} chars")
#             print(f"   Input tokens: {usage.input_tokens}")
#             print(f"   Output tokens: {usage.output_tokens}")
            
#             # Validate minimum content
#             if len(full_content) < 2000:
#                 print(f"❌ Content too short: {len(full_content)} chars")
#                 if retry_count < MAX_RETRIES - 1:
#                     retry_count += 1
#                     print(f"🔄 Retrying ({retry_count}/{MAX_RETRIES})...")
#                     continue
#                 raise ValueError(f"Generated contract too short: {len(full_content)} chars")
            
#             # Clean the HTML (remove styles, unwanted tags)
#             print("🧹 Cleaning HTML...")
#             cleaned_content = clean_generated_html(full_content)
            
#             # Ensure completeness (add missing sections if needed)
#             print("✔️  Ensuring completeness...")
#             complete_content = ensure_html_complete(cleaned_content)
            
#             # Validate quality
#             quality = validate_contract_quality(complete_content, stop_reason)
            
#             print(f"📊 Quality metrics:")
#             print(f"   Complete: {quality['is_complete']}")
#             print(f"   Sections: {quality['section_count']}")
#             print(f"   Words: {quality['word_count']}")
#             print(f"   Pages: ~{quality['estimated_pages']}")
#             print(f"   Has signature: {quality['has_signature']}")
            
#             if quality['warnings']:
#                 print(f"⚠️  Warnings: {', '.join(quality['warnings'])}")
            
#             # Check if we should retry
#             if stop_reason == 'max_tokens' and not quality['has_signature']:
#                 if retry_count < MAX_RETRIES - 1:
#                     retry_count += 1
#                     print(f"🔄 Contract incomplete, retrying ({retry_count}/{MAX_RETRIES})...")
#                     continue
            
#             print(f"✅ Contract generation successful!")
#             print(f"   Final length: {len(complete_content)} chars")
            
#             return {
#                 'success': True,
#                 'content': complete_content,
#                 'metadata': {
#                     'model': MODEL,
#                     'length': len(complete_content),
#                     'word_count': quality['word_count'],
#                     'estimated_pages': quality['estimated_pages'],
#                     'section_count': quality['section_count'],
#                     'stop_reason': stop_reason,
#                     'complete': quality['is_complete'],
#                     'has_signature': quality['has_signature'],
#                     'tokens_used': {
#                         'input': usage.input_tokens,
#                         'output': usage.output_tokens,
#                         'total': usage.input_tokens + usage.output_tokens
#                     },
#                     'quality_warnings': quality['warnings'],
#                     'timestamp': datetime.utcnow().isoformat()
#                 }
#             }
            
#         except RateLimitError as e:
#             last_error = e
#             retry_count += 1
#             print(f"⚠️  Rate limit hit, retry {retry_count}/{MAX_RETRIES}")
#             if retry_count < MAX_RETRIES:
#                 import time
#                 time.sleep(RETRY_DELAY * retry_count)
#             continue
            
#         except APIConnectionError as e:
#             last_error = e
#             retry_count += 1
#             print(f"⚠️  Connection error, retry {retry_count}/{MAX_RETRIES}: {str(e)}")
#             if retry_count < MAX_RETRIES:
#                 import time
#                 time.sleep(RETRY_DELAY)
#             continue
            
#         except APIError as e:
#             print(f"❌ API error: {str(e)}")
#             raise
            
#         except Exception as e:
#             print(f"❌ Unexpected error: {str(e)}")
#             print(traceback.format_exc())
#             raise
    
#     # If we exhausted retries
#     error_msg = f"Failed after {MAX_RETRIES} retries. Last error: {str(last_error)}"
#     print(f"❌ {error_msg}")
#     raise Exception(error_msg)


# def validate_input(prompt: str) -> Optional[str]:
#     """Validate user input before processing"""
#     if not prompt or not prompt.strip():
#         return "Prompt cannot be empty"
    
#     if len(prompt.strip()) < 10:
#         return "Prompt is too short. Please provide more details about your contract needs."
    
#     if len(prompt) > 5000:
#         return "Prompt is too long. Please limit to 5000 characters."
    
#     return None


# def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
#     """
#     Main Lambda handler for REST API
#     Generates complete contracts with clean HTML
#     """
#     request_id = context.aws_request_id
#     print(f"{'='*80}")
#     print(f"🔵 Lambda invoked - Request ID: {request_id}")
#     print(f"{'='*80}")
    
#     try:
#         # Parse request body
#         if 'body' in event:
#             if isinstance(event['body'], str):
#                 body = json.loads(event['body'])
#             else:
#                 body = event['body']
#         else:
#             body = event
        
#         prompt = body.get('prompt', '').strip()
#         target_pages = body.get('target_pages', 10)
        
#         print(f"📝 Request details:")
#         print(f"   Prompt: {prompt[:100]}{'...' if len(prompt) > 100 else ''}")
#         print(f"   Target pages: {target_pages}")
        
#         # Validate input
#         validation_error = validate_input(prompt)
#         if validation_error:
#             print(f"❌ Validation failed: {validation_error}")
#             return create_response(400, {
#                 'error': validation_error,
#                 'type': 'validation_error'
#             })
        
#         # Generate contract
#         result = generate_contract_streaming(prompt, target_pages)
        
#         if result['success']:
#             print(f"✅ Request completed successfully")
#             return create_response(200, {
#                 'content': result['content'],
#                 'metadata': result['metadata']
#             })
#         else:
#             print(f"❌ Generation failed")
#             return create_response(500, {
#                 'error': 'Contract generation failed',
#                 'type': 'generation_error'
#             })
    
#     except ValueError as e:
#         print(f"❌ Validation error: {str(e)}")
#         return create_response(400, {
#             'error': str(e),
#             'type': 'validation_error'
#         })
    
#     except RateLimitError as e:
#         print(f"❌ Rate limit error: {str(e)}")
#         return create_response(429, {
#             'error': 'Service is currently busy. Please try again in a moment.',
#             'type': 'rate_limit_error',
#             'retry_after': 60
#         })
    
#     except APIError as e:
#         print(f"❌ API error: {str(e)}")
#         return create_response(502, {
#             'error': 'Error communicating with AI service. Please try again.',
#             'type': 'api_error',
#             'details': str(e)
#         })
    
#     except Exception as e:
#         print(f"❌ Unexpected error: {str(e)}")
#         print(traceback.format_exc())
#         return create_response(500, {
#             'error': 'An unexpected error occurred. Please try again.',
#             'type': 'internal_error',
#             'details': str(e) if os.environ.get('DEBUG') else None
#         })
#     finally:
#         print(f"{'='*80}")
#         print(f"🔵 Request {request_id} completed")
#         print(f"{'='*80}\n")


# def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
#     """Create standardized API Gateway response with proper CORS"""
#     return {
#         'statusCode': status_code,
#         'headers': {
#             'Content-Type': 'application/json',
#             'Access-Control-Allow-Origin': '*',
#             'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
#             'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
#             'Cache-Control': 'no-cache, no-store, must-revalidate',
#             'X-Content-Type-Options': 'nosniff'
#         },
#         'body': json.dumps(body, default=str)
#     }