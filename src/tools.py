import time

def tool_emergency_transfer(reason):
    print(f"[TOOL] Emergency Transfer Initiated: {reason}")
    print("I am sorry to interrupt, but those symptoms require immediate attention. I am transferring you to our emergency line now.")
    return "TRANSFER_INITIATED"

def tool_notify_nurse(details):
    print(f"[TOOL] Notify Nurse: {details}")
    return "NURSE_NOTIFIED"

def check_availability(provider, date):
    print(f"[TOOL] Checking availability for {provider} on {date}...")
    time.sleep(1) # Simulate delay
    return ["10:00 AM", "2:00 PM"]

def tool_vad():
    # Simulate voice activity detection
    # For simulation purposes, we assume user is not speaking unless indicated otherwise
    return False
