import unittest
import sys
import os

# Add src to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

try:
    from agent import AlexAgent
    import tools
except ImportError:
    # Fallback if running from src directory
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    from src.agent import AlexAgent
    from src import tools

class TestAlexAgent(unittest.TestCase):
    def setUp(self):
        self.agent = AlexAgent()

    def test_critical_triage(self):
        # Test CRITICAL flag: severe chest pain
        response = self.agent.process_input("I have severe chest pain")
        self.assertEqual(response, "TRANSFER_INITIATED")

    def test_critical_triage_bleeding(self):
        # Test CRITICAL flag: severe bleeding
        response = self.agent.process_input("I have severe bleeding")
        self.assertEqual(response, "TRANSFER_INITIATED")

    def test_routine_bleeding(self):
        # Test routine bleeding (gum bleeding) -> Should NOT trigger critical transfer
        response = self.agent.process_input("My gums are bleeding")
        self.assertNotEqual(response, "TRANSFER_INITIATED")
        # Agent assumes this is name/dob input and moves to INTENT_IDENT
        self.assertEqual(self.agent.state, "INTENT_IDENT")
        self.assertIn("how can i help", response.lower())


    def test_urgent_triage(self):
        # Test URGENT flag: fever > 103
        response = self.agent.process_input("I have a fever of 104")
        self.assertIn("alerted the nurse", response)
        # Should stay in current state (GREET)
        self.assertEqual(self.agent.state, "GREET")

    def test_routine_scheduling_flow(self):
        # 1. Greet -> Verify Name/DOB
        self.assertEqual(self.agent.state, "GREET")
        resp = self.agent.process_input("My name is John Doe, DOB 1/1/80")
        self.assertEqual(self.agent.state, "INTENT_IDENT")
        self.assertIn("how can i help", resp.lower())

        # 2. Intent -> Scheduling
        resp = self.agent.process_input("I need to schedule an appointment")
        self.assertEqual(self.agent.state, "DATA_COLLECT")
        self.assertIn("reason", resp.lower()) # Now asking for reason

        # 3. Data Collect (Reason) -> Provider
        resp = self.agent.process_input("Annual checkup")
        self.assertEqual(self.agent.state, "DATA_COLLECT")
        self.assertIn("which provider", resp.lower())

        # 4. Data Collect (Provider) -> Date
        resp = self.agent.process_input("Dr. Smith")
        self.assertEqual(self.agent.state, "DATA_COLLECT")
        self.assertIn("what date", resp.lower())

        # 5. Data Collect (Date) -> Offer Slots
        resp = self.agent.process_input("Tomorrow")
        self.assertEqual(self.agent.state, "DATA_COLLECT") # Stays in DATA_COLLECT to get time
        self.assertIn("checking", resp.lower())
        self.assertIn("Dr. Smith", resp)
        self.assertIn("10:00 AM", resp)

        # 6. Data Collect (Time) -> Confirm
        resp = self.agent.process_input("10:00 AM works")
        self.assertEqual(self.agent.state, "CONFIRM")
        self.assertIn("confirm", resp.lower())
        self.assertIn("10:00 am", resp.lower()) # Check captured time is echoed back

        # Verify Context
        self.assertEqual(self.agent.context["time"], "10:00 am")

        # 7. Confirm -> Close
        resp = self.agent.process_input("Yes, that is correct")
        self.assertEqual(self.agent.state, "CLOSE")
        self.assertIn("Perfect", resp)

    def test_routine_refill_flow(self):
        # 1. Greet
        self.agent.process_input("Jane Doe, 2/2/90")

        # 2. Intent -> Refill
        resp = self.agent.process_input("I need a refill")
        self.assertEqual(self.agent.state, "DATA_COLLECT")
        self.assertIn("Which medication", resp)

        # 3. Data Collect (Medication) -> Confirm
        resp = self.agent.process_input("Lisinopril")
        self.assertEqual(self.agent.state, "CONFIRM")
        self.assertIn("CVS", resp)

        # 4. Confirm -> Close
        resp = self.agent.process_input("Yes")
        self.assertEqual(self.agent.state, "CLOSE")
        self.assertIn("updated your results", resp)

    def test_confirm_rejection(self):
        # Setup state to CONFIRM
        self.agent.state = "CONFIRM"
        self.agent.context["intent"] = "SCHEDULING"

        # Test "I can't do that" -> Should not trigger confirmation
        resp = self.agent.process_input("I can't do that")
        self.assertNotIn("Perfect", resp)
        self.assertIn("apologize", resp.lower())

    def test_data_collect_time_capture(self):
         # Test extracting time from "I'll take 10am"
         self.agent.state = "DATA_COLLECT"
         self.agent.context["intent"] = "SCHEDULING"
         self.agent.context["reason"] = "Checkup"
         self.agent.context["provider"] = "Dr. Smith"
         self.agent.context["date"] = "Tomorrow"

         resp = self.agent.process_input("I'll take 10am")
         self.assertEqual(self.agent.context.get("time"), "10am")
         self.assertEqual(self.agent.state, "CONFIRM")

if __name__ == '__main__':
    unittest.main()
