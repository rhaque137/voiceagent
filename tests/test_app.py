import unittest
import json
import sys
import os

# Add src to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

try:
    from app import app
except ImportError:
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    from src.app import app

class FlaskAppTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_home_page(self):
        response = self.app.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Alex - Patient Coordinator', response.data)

    def test_chat_new_session(self):
        # Send a message with a new session ID
        payload = {"session_id": "test_session_1", "message": "My name is John"}
        response = self.app.post('/chat',
                                 data=json.dumps(payload),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("Thank you", data['response'])
        self.assertEqual(data['state'], "INTENT_IDENT")

    def test_chat_state_persistence(self):
        session_id = "test_session_persist"

        # 1. GREET
        self.app.post('/chat',
                      data=json.dumps({"session_id": session_id, "message": "John Doe"}),
                      content_type='application/json')

        # 2. INTENT
        response = self.app.post('/chat',
                                 data=json.dumps({"session_id": session_id, "message": "I need a refill"}),
                                 content_type='application/json')

        data = json.loads(response.data)
        self.assertEqual(data['state'], "DATA_COLLECT")
        self.assertIn("medication", data['response'].lower())

    def test_missing_session_id(self):
        response = self.app.post('/chat',
                                 data=json.dumps({"message": "Hello"}),
                                 content_type='application/json')
        self.assertEqual(response.status_code, 400)

if __name__ == '__main__':
    unittest.main()
