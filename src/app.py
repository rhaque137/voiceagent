from flask import Flask, render_template, request, jsonify
import sys
import os

# Add current directory to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agent import AlexAgent

app = Flask(__name__)

# Store sessions in memory
# Dictionary: session_id -> AlexAgent instance
sessions = {}

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    session_id = data.get('session_id')
    user_message = data.get('message')

    if not session_id:
        return jsonify({"error": "Session ID required"}), 400

    if session_id not in sessions:
        # Initialize new agent for session
        sessions[session_id] = AlexAgent()
        # Optionally, get initial greeting if it's the start
        # But usually user initiates or page load initiates

    agent = sessions[session_id]

    # Process message
    response_text = agent.process_input(user_message)

    # Check if agent state implies end of conversation
    # Optionally remove session
    if agent.state == "CLOSE" or response_text == "TRANSFER_INITIATED":
        # Maybe keep it for history but mark complete?
        pass

    return jsonify({
        "response": response_text,
        "state": agent.state,
        "context": agent.context
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
