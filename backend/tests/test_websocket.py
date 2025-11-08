"""
Test WebSocket connection and contract generation
"""

import asyncio
import websockets
import json
import sys

# Replace with your actual WebSocket URL
WS_URL = "wss://lmmxz22twa.execute-api.us-east-1.amazonaws.com/prod"

async def test_websocket():
    """Test WebSocket connection and message flow"""
    
    print("=" * 80)
    print("WebSocket Test")
    print("=" * 80)
    print(f"\nConnecting to: {WS_URL}\n")
    
    try:
        async with websockets.connect(WS_URL) as websocket:
            print("✅ Connected successfully!")
            print("-" * 80)
            
            # Send generate request
            request = {
                "action": "generate",
                "prompt": "Draft a simple NDA between two companies"
            }
            
            print(f"\n📤 Sending request:")
            print(f"   Action: {request['action']}")
            print(f"   Prompt: {request['prompt']}")
            print()
            
            await websocket.send(json.dumps(request))
            print("✅ Request sent successfully!")
            print("-" * 80)
            
            # Receive messages
            print("\n📥 Receiving messages:\n")
            
            message_count = 0
            start_time = asyncio.get_event_loop().time()
            
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=300.0)
                    message_count += 1
                    data = json.loads(message)
                    
                    elapsed = asyncio.get_event_loop().time() - start_time
                    
                    print(f"[{elapsed:.1f}s] Message #{message_count}: {data.get('type')}")
                    
                    if data.get('type') == 'start':
                        print(f"   💬 {data.get('message', 'Started')}")
                    
                    elif data.get('type') == 'content':
                        content = data.get('content', '')
                        print(f"   📄 Content received: {len(content)} characters")
                        
                        # Save to file
                        with open('websocket_test_contract.html', 'w') as f:
                            f.write(content)
                        print(f"   💾 Saved to: websocket_test_contract.html")
                    
                    elif data.get('type') == 'complete':
                        print(f"   ✅ {data.get('message', 'Complete')}")
                        print("\n" + "=" * 80)
                        print(f"✅ TEST PASSED - Total time: {elapsed:.1f}s")
                        print("=" * 80)
                        break
                    
                    elif data.get('type') == 'error':
                        error = data.get('error', 'Unknown error')
                        print(f"   ❌ Error: {error}")
                        print("\n" + "=" * 80)
                        print("❌ TEST FAILED - Error received")
                        print("=" * 80)
                        return False
                    
                    else:
                        print(f"   ⚠️  Unknown message type: {data.get('type')}")
                    
                    print()
                
                except asyncio.TimeoutError:
                    print("\n❌ Timeout waiting for response (300s)")
                    print("=" * 80)
                    print("❌ TEST FAILED - Timeout")
                    print("=" * 80)
                    return False
            
            return True
    
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"\n❌ Connection failed with status code: {e.status_code}")
        print(f"   This usually means:")
        if e.status_code == 403:
            print("   - WebSocket API is not deployed correctly")
            print("   - Check your SAM template WebSocket configuration")
        elif e.status_code == 404:
            print("   - WebSocket URL is incorrect")
            print("   - Verify the URL from your stack outputs")
        else:
            print(f"   - Unexpected status: {e.status_code}")
        return False
    
    except websockets.exceptions.WebSocketException as e:
        print(f"\n❌ WebSocket error: {str(e)}")
        return False
    
    except ConnectionRefusedError:
        print("\n❌ Connection refused")
        print("   - Check if WebSocket API is deployed")
        print("   - Verify the URL is correct")
        return False
    
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_connection_only():
    """Just test if we can connect"""
    
    print("=" * 80)
    print("WebSocket Connection Test (Quick)")
    print("=" * 80)
    print(f"\nConnecting to: {WS_URL}\n")
    
    try:
        async with websockets.connect(WS_URL) as websocket:
            print("✅ Connection successful!")
            print("   WebSocket is accepting connections.")
            print("\n" + "=" * 80)
            return True
    except Exception as e:
        print(f"❌ Connection failed: {str(e)}")
        print("\n" + "=" * 80)
        return False


def main():
    """Main test runner"""
    
    # Check if URL is configured
    if "YOUR-WEBSOCKET-ID" in WS_URL:
        print("\n⚠️  ERROR: Please update WS_URL in test_websocket.py with your actual WebSocket URL!")
        print("\nGet it with:")
        print("  aws cloudformation describe-stacks --stack-name ai-contract-generator \\")
        print("    --query 'Stacks[0].Outputs[?OutputKey==`WebSocketUrl`].OutputValue' --output text")
        print()
        sys.exit(1)
    
    # Parse command line arguments
    test_type = sys.argv[1] if len(sys.argv) > 1 else "full"
    
    if test_type == "quick":
        print("\nRunning quick connection test...\n")
        success = asyncio.run(test_connection_only())
    else:
        print("\nRunning full WebSocket test (this will take 45-90 seconds)...\n")
        success = asyncio.run(test_websocket())
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()