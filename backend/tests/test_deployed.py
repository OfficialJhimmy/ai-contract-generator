"""
Test the deployed API
"""

import requests
import json

# REPLACE THIS with your actual API endpoint from sam deploy output
API_ENDPOINT = "https://iplsasoia7.execute-api.us-east-1.amazonaws.com/Prod/generate"

def test_deployed_api():
    print("Testing deployed API...")
    print(f"Endpoint: {API_ENDPOINT}")
    print("=" * 80)
    
    payload = {
        "prompt": "Draft terms of service for a cloud cyber SaaS company based in New York"
    }
    
    try:
        response = requests.post(
            API_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=300  # 5 minutes
        )
        
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("\n✅ SUCCESS!")
            print(f"Content length: {len(data.get('content', ''))} characters")
            
            # Save the contract
            with open('deployed_test_contract.html', 'w') as f:
                f.write(data['content'])
            print("\n📄 Contract saved to: deployed_test_contract.html")
        else:
            print(f"\n❌ ERROR: {response.text}")
    
    except Exception as e:
        print(f"\n❌ EXCEPTION: {str(e)}")

if __name__ == '__main__':
    # Install requests if needed: pip install requests
    test_deployed_api()