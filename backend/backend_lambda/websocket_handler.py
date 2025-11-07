"""
WebSocket handler for real-time contract streaming with chunked delivery
"""

import json
import os
import boto3
from handler import generate_contract_streaming, validate_input

# API Gateway Management API client
apigateway_management_api = None


def get_api_gateway_client(event):
    """Initialize API Gateway Management API client"""
    global apigateway_management_api
    
    if apigateway_management_api is None:
        domain_name = event['requestContext']['domainName']
        stage = event['requestContext']['stage']
        endpoint_url = f"https://{domain_name}/{stage}"
        
        apigateway_management_api = boto3.client(
            'apigatewaymanagementapi',
            endpoint_url=endpoint_url
        )
    
    return apigateway_management_api


def send_message(connection_id, data, event):
    """Send message to WebSocket client"""
    try:
        client = get_api_gateway_client(event)
        client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(data).encode('utf-8')
        )
        return True
    except client.exceptions.GoneException:
        print(f"Connection {connection_id} is gone")
        return False
    except Exception as e:
        print(f"Error sending message: {str(e)}")
        return False


def connection_handler(event, context):
    """Handle WebSocket connection"""
    connection_id = event['requestContext']['connectionId']
    print(f"WebSocket $connect: {connection_id}")
    return {'statusCode': 200}


def disconnection_handler(event, context):
    """Handle WebSocket disconnection"""
    connection_id = event['requestContext']['connectionId']
    print(f"WebSocket $disconnect: {connection_id}")
    return {'statusCode': 200}


def default_handler(event, context):
    """Handle default/unknown routes"""
    connection_id = event['requestContext']['connectionId']
    route_key = event['requestContext'].get('routeKey', 'unknown')
    print(f"WebSocket default route: {route_key} from {connection_id}")
    return {'statusCode': 200}


def message_handler(event, context):
    """
    Handle WebSocket messages - generate contract with chunked streaming
    to avoid API Gateway 30-second timeout
    """
    connection_id = event['requestContext']['connectionId']
    
    print(f"WebSocket message handler called for connection: {connection_id}")
    
    try:
        # Parse message body
        body = json.loads(event.get('body', '{}'))
        action = body.get('action', '')
        prompt = body.get('prompt', '')
        
        print(f"Action: {action}, Prompt: {prompt[:100] if prompt else 'none'}")
        
        # Validate action
        if action != 'generate':
            print(f"Unknown action: {action}")
            send_message(connection_id, {
                'type': 'error',
                'error': f'Unknown action: {action}'
            }, event)
            return {'statusCode': 400}
        
        # Validate prompt
        validation_error = validate_input(prompt)
        if validation_error:
            print(f"Validation error: {validation_error}")
            send_message(connection_id, {
                'type': 'error',
                'error': validation_error
            }, event)
            return {'statusCode': 400}
        
        # Send start notification
        print("Sending start notification...")
        send_message(connection_id, {
            'type': 'start',
            'message': 'Contract generation started...'
        }, event)
        
        # Generate contract (this can take 30-60+ seconds)
        print("Starting contract generation...")
        result = generate_contract_streaming(prompt)
        
        if result['success']:
            print(f"Generation successful, content length: {len(result['content'])}")
            
            # CRITICAL: Send content in chunks to keep connection alive
            content = result['content']
            chunk_size = 30000  # ~30KB chunks
            
            if len(content) > chunk_size:
                print(f"Sending large content in chunks...")
                for i in range(0, len(content), chunk_size):
                    chunk = content[i:i+chunk_size]
                    is_last = i + chunk_size >= len(content)
                    
                    send_message(connection_id, {
                        'type': 'chunk',
                        'content': chunk,
                        'is_last': is_last,
                        'chunk_index': i // chunk_size
                    }, event)
                    
                print(f"Sent content in {(len(content) // chunk_size) + 1} chunks")
            else:
                # Send as single message if small enough
                send_message(connection_id, {
                    'type': 'content',
                    'content': content,
                    'metadata': result['metadata']
                }, event)
            
            # Send completion
            send_message(connection_id, {
                'type': 'complete',
                'message': 'Contract generated successfully',
                'metadata': result['metadata']
            }, event)
            
            return {'statusCode': 200}
        else:
            print("Generation failed")
            send_message(connection_id, {
                'type': 'error',
                'error': 'Generation failed'
            }, event)
            return {'statusCode': 500}
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {str(e)}")
        send_message(connection_id, {
            'type': 'error',
            'error': 'Invalid JSON in request'
        }, event)
        return {'statusCode': 400}
        
    except Exception as e:
        print(f"Error in message handler: {str(e)}")
        import traceback
        traceback.print_exc()
        
        send_message(connection_id, {
            'type': 'error',
            'error': str(e)
        }, event)
        return {'statusCode': 500}


def lambda_handler(event, context):
    """Main router for WebSocket events"""
    
    print(f"WebSocket event received: {json.dumps(event, default=str)}")
    
    route_key = event['requestContext']['routeKey']
    
    print(f"Route: {route_key}")
    
    # Route to appropriate handler
    if route_key == '$connect':
        return connection_handler(event, context)
    elif route_key == '$disconnect':
        return disconnection_handler(event, context)
    elif route_key == '$default':
        return default_handler(event, context)
    elif route_key == 'generate':
        return message_handler(event, context)
    else:
        print(f"Unknown route: {route_key}")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Unknown route'})
        }