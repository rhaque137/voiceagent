export function warmTransferTwiml(frontDeskNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Connecting you to the front desk now.</Say>
  <Dial>${frontDeskNumber}</Dial>
</Response>`;
}
