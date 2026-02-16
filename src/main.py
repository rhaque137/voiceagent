import sys
import os

# Add src to path if running from root
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import agent
except ImportError:
    # If running as module
    from . import agent

def main():
    alex = agent.AlexAgent()
    print(f"Alex: {alex.get_greeting()}")

    while True:
        try:
            user_input = input("You: ")
            if not user_input:
                continue

            if user_input.lower() in ["exit", "quit"]:
                break

            # Simulate interruption logic
            if "[INTERRUPT]" in user_input:
                print("Alex: Sorry, you were saying?")
                continue

            response = alex.process_input(user_input)
            print(f"Alex: {response}")

            # Check for termination condition
            if response == "TRANSFER_INITIATED":
                 print("[Call Ended due to Emergency Transfer]")
                 break

            if alex.state == "CLOSE" and "Take care" in response:
                break

        except KeyboardInterrupt:
            print("\nExiting...")
            break
        except Exception as e:
            print(f"Error: {e}")
            break

if __name__ == "__main__":
    main()
