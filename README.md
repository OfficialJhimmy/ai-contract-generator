# 🤖 FirstRead- AI Contract Generator

A production-ready AI-powered legal contract generator with real-time streaming using AWS Lambda, WebSockets, and Claude AI.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![AWS](https://img.shields.io/badge/AWS-Lambda-orange.svg)
![React](https://img.shields.io/badge/React-19.1-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

## ✨ Features

- **⚡ Real-time Streaming**: WebSocket-based streaming for instant contract generation feedback
- **🎨 Beautiful UI**: Modern, responsive interface with Tailwind CSS
- **📄 Export Options**: Download contracts as Word (.docx) or PDF
- **🔄 Live Typing Effect**: See contracts being generated character-by-character
- **📊 Progress Tracking**: Visual feedback with loading states and progress indicators
- **🌐 Serverless Architecture**: Fully serverless using AWS Lambda and API Gateway
- **🤖 Claude AI Integration**: Powered by Anthropic's Claude Sonnet 4.5
- **📱 Responsive Design**: Works seamlessly on desktop, tablet, and mobile

## 🏗️ Architecture

```
┌─────────────┐      WebSocket      ┌──────────────┐      ┌─────────────┐
│   React     │◄───────────────────►│ API Gateway  │◄────►│   Lambda    │
│  Frontend   │                     │  (WebSocket) │      │   Handler   │
└─────────────┘                     └──────────────┘      └─────────────┘
                                                                  │
                                                                  ▼
                                                           ┌─────────────┐
                                                           │  Claude AI  │
                                                           │     API     │
                                                           └─────────────┘
```

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **AWS Account** with CLI configured
- **AWS SAM CLI** installed
- **Anthropic API Key** ([Get one here](https://console.anthropic.com/))

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/contract-generator.git
cd contract-generator
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r backend_lambda/requirements.txt

# Create .env file (optional, for local testing)
echo "ANTHROPIC_API_KEY=your_api_key_here" > .env

# Build the SAM application
sam build

# Deploy to AWS (follow prompts)
sam deploy --guided
```

**During deployment, you'll be asked:**
- Stack Name: `ai-contract-generator`
- AWS Region: `us-east-1` (or your preferred region)
- AnthropicApiKey: Your Anthropic API key
- Confirm changes: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to config file: `Y`

**Save the outputs:**
- `RestApiEndpoint`: Your REST API URL
- `WebSocketUrl`: Your WebSocket URL (wss://...)
- `FunctionName`: Lambda function name

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file with your WebSocket URL
echo "VITE_WS_URL=wss://YOUR-WEBSOCKET-ID.execute-api.us-east-1.amazonaws.com/prod" > .env

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📁 Project Structure

```
contract-generator/
├── backend/
│   ├── backend_lambda/
│   │   ├── handler.py              # Main Lambda handler (REST)
│   │   ├── websocket_handler.py    # WebSocket handler
│   │   └── requirements.txt        # Python dependencies
│   ├── template.yaml               # SAM template
│   ├── samconfig.toml             # SAM configuration
│   ├── test_local.py              # Local testing script
│   └── test_websocket.py          # WebSocket testing script
├── frontend/
│   ├── src/
│   │   ├── components/            # React components
│   │   ├── hooks/                 # Custom hooks (useWebSocket)
│   │   ├── lib/                   # Utilities (export, utils)
│   │   ├── App.tsx                # Main application
│   │   └── main.tsx               # Entry point
│   ├── public/                    # Static assets
│   ├── package.json               # Node dependencies
│   └── vite.config.ts             # Vite configuration
└── README.md
```

## 🔧 Configuration

### Backend Environment Variables

Set in AWS Lambda console or through SAM template:

```yaml
Environment:
  Variables:
    ANTHROPIC_API_KEY: your_api_key_here
    LOG_LEVEL: INFO
```

### Frontend Environment Variables

Create `frontend/.env`:

```bash
VITE_WS_URL=wss://your-websocket-id.execute-api.us-east-1.amazonaws.com/prod
```

## 🧪 Testing

### Test Backend Locally

```bash
cd backend

# Test REST API locally
python test_local.py

# Test WebSocket connection
python test_websocket.py
```

### Test Deployed Backend

```bash
# Get WebSocket URL from CloudFormation
aws cloudformation describe-stacks \
  --stack-name ai-contract-generator \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketUrl`].OutputValue' \
  --output text

# Update test_websocket.py with your URL
# Then run:
python test_websocket.py
```

### Test Frontend

```bash
cd frontend
npm run dev
```

## 📊 Monitoring

### View Lambda Logs

```bash
# Real-time logs
aws logs tail /aws/lambda/ai-contract-generator-WebSocketFunction --follow

# Last 10 minutes
aws logs tail /aws/lambda/ai-contract-generator-WebSocketFunction --since 10m
```

### CloudWatch Metrics

Monitor in AWS Console:
- Lambda invocations
- Error rates
- Duration
- WebSocket connection count

## 🎨 Customization

### Change Contract Generation Model

Edit `backend/backend_lambda/handler.py`:

```python
MODEL = "claude-sonnet-4-5-20250929"  # Change model here
MAX_TOKENS = 4000  # Adjust token limit
```

### Modify UI Theme

Edit `frontend/src/index.css` for global styles or use Tailwind classes in components.

### Add Quick Prompts

Edit `frontend/src/App.tsx`:

```typescript
const QUICK_PROMPTS = [
  "Your custom prompt 1",
  "Your custom prompt 2",
  // Add more...
]
```

## 🚀 Deployment

### Deploy Backend Updates

```bash
cd backend
sam build
sam deploy
```

### Deploy Frontend

#### Option 1: AWS Amplify

```bash
cd frontend
npm run build

# Upload dist/ folder to Amplify
```

#### Option 2: Netlify

```bash
# Connect GitHub repo to Netlify
# Build command: npm run build
# Publish directory: dist
```

#### Option 3: Vercel

```bash
cd frontend
vercel --prod
```

## 📈 Performance Optimization

### Backend
- **Lambda Memory**: Increase to 3008 MB for faster execution
- **Timeout**: Set to 900 seconds (15 minutes) for large contracts
- **Concurrency**: Configure reserved concurrency for production

### Frontend
- **Code Splitting**: Vite automatically splits code
- **Lazy Loading**: Components loaded on demand
- **Compression**: Enable gzip/brotli on CDN

## 🔒 Security

- ✅ API Key stored in AWS Systems Manager Parameter Store
- ✅ CORS configured for specific origins only
- ✅ WebSocket authentication via connection ID
- ✅ Input validation on all endpoints
- ✅ Rate limiting via API Gateway

### Production Security Checklist

- [ ] Set up AWS WAF for API Gateway
- [ ] Enable AWS CloudTrail logging
- [ ] Implement API key authentication
- [ ] Add request throttling
- [ ] Enable AWS Shield for DDoS protection
- [ ] Use AWS Secrets Manager for sensitive data

## 🐛 Troubleshooting

### WebSocket Connection Fails

1. Check WebSocket URL in `.env`
2. Verify API Gateway deployment: `aws apigatewayv2 get-apis`
3. Check Lambda permissions
4. View CloudWatch logs

### "Endpoint request timed out"

- Increase Lambda timeout in `template.yaml`:
  ```yaml
  Timeout: 900  # 15 minutes
  ```

### No Content Appearing

1. Check browser console for errors
2. Verify WebSocket messages format
3. Check CloudWatch logs for backend errors

### Export Not Working

- Ensure `html2canvas` and `docx` packages are installed
- Check browser console for errors
- Verify content is generated before export

## 📚 API Reference

### WebSocket Messages

#### Client → Server

```json
{
  "action": "generate",
  "prompt": "Draft an NDA...",
  "target_pages": 10
}
```

#### Server → Client

```json
// Start
{ "type": "start", "message": "Generating contract..." }

// Chunk (streaming)
{ "type": "chunk", "content": "<html>..." }

// Complete
{ 
  "type": "complete", 
  "message": "Contract generated successfully",
  "metadata": { "length": 5000 }
}

// Error
{ "type": "error", "error": "Error message" }
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic Claude](https://www.anthropic.com/) for the AI capabilities
- [AWS](https://aws.amazon.com/) for serverless infrastructure
- [React](https://react.dev/) and [Vite](https://vitejs.dev/) for the frontend
- [Tailwind CSS](https://tailwindcss.com/) for styling

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/contract-generator/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/contract-generator/discussions)
- **Email**: your.email@example.com

## 🗺️ Roadmap

- [ ] Add user authentication
- [ ] Implement contract templates library
- [ ] Add collaborative editing
- [ ] Support multiple languages
- [ ] Add version control for contracts
- [ ] Integrate electronic signatures
- [ ] Add contract comparison tool

---

**Built with ❤️ using AWS, React, and Claude AI**