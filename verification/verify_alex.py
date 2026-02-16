from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # 1. Navigate to home
    page.goto("http://127.0.0.1:5000")

    # Verify Title
    assert "Alex - Patient Coordinator" in page.title()

    # Verify Initial Greeting
    page.wait_for_selector(".agent-message")
    greeting = page.locator(".agent-message").first.inner_text()
    print(f"Greeting: {greeting}")
    assert "Hello, this is Alex" in greeting

    # 2. Interact: Send Name
    page.fill("#user-input", "John Doe, 1/1/80")
    page.click("button")

    # Verify Response
    page.wait_for_selector(".agent-message:nth-child(3)")
    response1 = page.locator(".agent-message").nth(1).inner_text()
    print(f"Response 1: {response1}")
    assert "how can I help" in response1

    # 3. Interact: Schedule Appointment
    page.fill("#user-input", "I need to schedule an appointment")
    page.click("button")

    # Verify Response
    page.wait_for_selector(".agent-message:nth-child(5)")
    response2 = page.locator(".agent-message").nth(2).inner_text()
    print(f"Response 2: {response2}")
    assert "reason for your visit" in response2

    # Take Screenshot
    page.screenshot(path="verification/alex_chat.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
