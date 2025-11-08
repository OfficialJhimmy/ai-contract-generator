"""
WebSocket handler - Fixed for real-time streaming with proper message format
"""

import json
import os
import boto3
import traceback
from handler import (
    generate_contract_streaming, 
    validate_input,
    get_anthropic_client
)

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
    """Send message to WebSocket client with error handling"""
    try:
        client = get_api_gateway_client(event)
        
        # Ensure data is properly formatted
        if isinstance(data, dict):
            message = json.dumps(data)
        else:
            message = str(data)
            
        client.post_to_connection(
            ConnectionId=connection_id,
            Data=message.encode('utf-8')
        )
        return True
    except client.exceptions.GoneException:
        print(f"Connection {connection_id} is gone")
        return False
    except Exception as e:
        print(f"Error sending message: {str(e)}")
        traceback.print_exc()
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
    Handle WebSocket messages - FIXED for proper streaming
    """
    connection_id = event['requestContext']['connectionId']
    
    print(f"WebSocket message handler called for connection: {connection_id}")
    
    try:
        # Parse incoming message
        body = json.loads(event.get('body', '{}'))
        action = body.get('action', '')
        prompt = body.get('prompt', '')
        target_pages = body.get('target_pages', 10)
        
        print(f"Action: {action}, Prompt: {prompt[:100] if prompt else 'none'}")
        
        # Validate action
        if action != 'generate':
            send_message(connection_id, {
                'type': 'error',
                'error': f'Unknown action: {action}'
            }, event)
            return {'statusCode': 400}
        
        # Validate input
        validation_error = validate_input(prompt)
        if validation_error:
            send_message(connection_id, {
                'type': 'error',
                'error': validation_error
            }, event)
            return {'statusCode': 400}
        
        # Send start notification
        print("Sending start message...")
        send_message(connection_id, {
            'type': 'start',
            'message': 'Generating contract...'
        }, event)
        
        # Generate and stream content
        print("Starting generation stream...")
        stream = generate_contract_streaming(prompt, target_pages)
        
        accumulated = ""
        chunk_buffer = ""
        CHUNK_SIZE = 100  # Send every 100 characters
        
        try:
            with stream as s:
                for text in s.text_stream:
                    chunk_buffer += text
                    accumulated += text
                    
                    # Send chunks periodically
                    if len(chunk_buffer) >= CHUNK_SIZE:
                        success = send_message(connection_id, {
                            'type': 'chunk',
                            'content': chunk_buffer
                        }, event)
                        
                        if not success:
                            print("Failed to send chunk, client may have disconnected")
                            break
                            
                        chunk_buffer = ""
                
                # Send remaining buffer
                if chunk_buffer:
                    send_message(connection_id, {
                        'type': 'chunk',
                        'content': chunk_buffer
                    }, event)
        
        except Exception as stream_error:
            print(f"Streaming error: {str(stream_error)}")
            traceback.print_exc()
            send_message(connection_id, {
                'type': 'error',
                'error': f'Streaming error: {str(stream_error)}'
            }, event)
            return {'statusCode': 500}
        
        # Send completion message
        print(f"Generation complete. Total length: {len(accumulated)}")
        send_message(connection_id, {
            'type': 'complete',
            'message': 'Contract generated successfully',
            'metadata': {
                'length': len(accumulated),
                'chunks_sent': True
            }
        }, event)
        
        return {'statusCode': 200}
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {str(e)}")
        send_message(connection_id, {
            'type': 'error',
            'error': 'Invalid JSON in request'
        }, event)
        return {'statusCode': 400}
        
    except Exception as e:
        print(f"Error in message handler: {str(e)}")
        traceback.print_exc()
        
        send_message(connection_id, {
            'type': 'error',
            'error': f'Internal error: {str(e)}'
        }, event)
        return {'statusCode': 500}


def lambda_handler(event, context):
    """Main router for WebSocket events"""
    
    print(f"WebSocket event received: {json.dumps(event, default=str)}")
    
    route_key = event['requestContext']['routeKey']
    print(f"Route: {route_key}")
    
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