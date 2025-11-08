"""
Local testing script for Lambda handler
Run this to test your function before deploying
"""
import sys
import json
import os
from dotenv import load_dotenv


sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from .env
load_dotenv()

# Import the handler
from backend_lambda.handler import lambda_handler

def test_contract_generation():
    """
    Test the contract generation with a sample prompt
    """
    # Sample event (simulating API Gateway)
    event = {
        'body': json.dumps({
            'prompt': 'Draft terms of service for a cloud cyber SaaS company based in New York'
        })
    }
    
    # Mock context
    class Context:
        function_name = 'test-function'
        memory_limit_in_mb = 1024
        invoked_function_arn = 'arn:aws:lambda:us-east-1:123456789012:function:test'
        aws_request_id = 'test-request-id'
    
    context = Context()
    
    print("Testing contract generation...")
    print("=" * 80)
    
    try:
        response = lambda_handler(event, context)
        
        print(f"\nStatus Code: {response['statusCode']}")
        print(f"Headers: {json.dumps(response['headers'], indent=2)}")
        
        body = json.loads(response['body'])
        
        if response['statusCode'] == 200:
            print("\n✅ SUCCESS!")
            print(f"Content length: {len(body.get('content', ''))} characters")
            print(f"Metadata: {json.dumps(body.get('metadata', {}), indent=2)}")
            
            # Save the contract to a file
            with open('test_contract.html', 'w') as f:
                f.write(body['content'])
            print("\n📄 Contract saved to: test_contract.html")
            print("Open it in a browser to view!")
            
        else:
            print("\n❌ ERROR!")
            print(f"Error: {json.dumps(body, indent=2)}")
    
    except Exception as e:
        print(f"\n❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    test_contract_generation()