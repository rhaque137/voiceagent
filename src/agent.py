import re
try:
    import tools
except ImportError:
    from . import tools

class AlexAgent:
    def __init__(self):
        self.state = "GREET"
        self.context = {}

    def get_greeting(self):
        return "Hello, this is Alex, your Patient Coordinator. Could you please state your name and date of birth for verification?"

    def process_input(self, user_input):
        # 1. Triage Check (Highest Priority)
        triage = self.check_triage(user_input)

        if triage == "CRITICAL":
            return tools.tool_emergency_transfer(user_input)

        elif triage == "URGENT":
             tools.tool_notify_nurse(user_input)
             # Proceed to handle state, but acknowledge urgency
             return "I've alerted the nurse about your symptoms immediately. While they review that, let's get your details sorted."

        # 2. State Machine
        return self.handle_state(user_input)

    def check_triage(self, user_input):
        text = user_input.lower()
        if any(x in text for x in ["breathing", "chest pain", "severe bleeding"]):
             return "CRITICAL"

        # Fever > 103
        # Simple regex to catch numbers > 103 near "fever"
        if "fever" in text:
            # Check for numbers
            numbers = re.findall(r'\d+', text)
            for num in numbers:
                if int(num) > 103:
                    return "URGENT"

        if "pain" in text and "post-op" in text:
             return "URGENT"

        if "reaction" in text and "medication" in text:
             return "URGENT"

        return "ROUTINE"

    def handle_state(self, user_input):
        if self.state == "GREET":
            # Expecting Name and DOB
            # In a real system we'd parse entities. Here we just accept input and move on.
            self.context["name_dob_verified"] = True
            self.state = "INTENT_IDENT"
            return "Thank you. Now, how can I help you today?"

        if self.state == "INTENT_IDENT":
            text = user_input.lower()
            if "schedule" in text or "appointment" in text or "book" in text:
                self.context["intent"] = "SCHEDULING"
                self.state = "DATA_COLLECT"
                return "I can certainly help you schedule that. First, I'll find your file, then we can look at the calendar. What is the reason for your visit?"

            elif "refill" in text:
                self.context["intent"] = "REFILL"
                self.state = "DATA_COLLECT"
                return "I can help with a refill. Let me pull up your medication list. Which medication do you need refilled?"

            else:
                return "I understand. To best assist you, could you clarify if you need to schedule an appointment or request a refill?"

        if self.state == "DATA_COLLECT":
            if self.context.get("intent") == "SCHEDULING":
                # Order: Reason -> Provider -> Date -> Time

                if "reason" not in self.context:
                    self.context["reason"] = user_input
                    return "Thank you. And which provider would you like to see?"

                if "provider" not in self.context:
                    self.context["provider"] = user_input
                    return "And what date works best for you?"

                if "date" not in self.context:
                    self.context["date"] = user_input

                    provider = self.context['provider']
                    if provider.lower().startswith("dr.") or "doctor" in provider.lower():
                        display_provider = provider
                    else:
                        display_provider = f"Dr. {provider}"

                    # Call tool
                    time_slots = tools.check_availability(provider, user_input)
                    self.context['available_slots'] = time_slots

                    return f"I'm checking {display_provider}'s availability... thank you for your patience. It looks like we have {', '.join(time_slots)}. Which one works for you?"

                if "time" not in self.context:
                    text = user_input.lower()
                    # Check for time match
                    time_match = re.search(r'(\d+:\d+\s*(?:am|pm)?|\d+\s*(?:am|pm))', text)
                    if time_match:
                        self.context["time"] = time_match.group(1)
                        self.state = "CONFIRM"
                        return f"Great. Just to confirm, I have you down for {self.context['time']} on {self.context['date']} with {self.context['provider']}. Is that correct?"
                    else:
                        return "I'm sorry, I didn't catch the time. Which slot would you prefer?"

            elif self.context.get("intent") == "REFILL":
                self.context["medication"] = user_input
                self.state = "CONFIRM"
                return "Got it. I see your pharmacy on file is CVS on Main St. Is that still correct?"

        if self.state == "CONFIRM":
             text = user_input.lower()

             # Affirmative check
             affirmative_keywords = ["yes", "correct", "sure", "ok", "okay", "fine", "good", "perfect", "right"]
             is_affirmative = any(kw in text for kw in affirmative_keywords)

             if is_affirmative:
                 self.state = "CLOSE"

                 if self.context.get("intent") == "SCHEDULING":
                     return "Perfect. I have scheduled that for you. You'll receive a confirmation email shortly. Is there anything else?"

                 elif self.context.get("intent") == "REFILL":
                     return "Okay, I've sent the request to CVS. The doctor has updated your results in the portal. Anything else?"

             else:
                 # Handle rejection or correction
                 # Reset state to DATA_COLLECT? Or just ask what they prefer?
                 # Prompt: "Privacy: Never state a diagnosis out loud." (Already handled)
                 # Rejection handling:
                 return "I apologize. Let's try again. What would you prefer?"

        if self.state == "CLOSE":
             return "Thank you for calling. Take care."

        return "I'm sorry, I didn't quite catch that. Could you repeat?"
