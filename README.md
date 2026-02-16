# Alex Voice Agent (Doctor's Office)

Production-ready TypeScript scaffold for a phone-optimized voice agent named **Alex** that handles:
- appointment book/reschedule/cancel
- warm transfer to front desk
- emergency triage redirection
- safe call summaries with redaction

## Architecture Summary

- `src/agent.ts`: orchestrator with call state machine (`S0`-`S9`, `SERR`), loop limits, safety-first routing
- `src/nlu.ts`: rule-based intent + entity extraction with low-confidence detection fallback
- `src/scheduler.ts`: required backend function interfaces + mock adapter implementation
- `src/safety.ts`: emergency/urgent triage rule engine
- `src/transfer.ts`: minimal-PHI handoff summary generator
- `src/prompts.ts`: system + reusable voice prompts
- `src/utils.ts`: validation, formatting, redaction, slot ranking
- `config/clinic.json`: clinic configuration (hours/providers/modalities/front desk number)
- `tests/conversation.test.ts`: 8 required scripted transcript scenarios

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create runtime env file:

```bash
cp .env.example .env
```

3. Run demo conversation:

```bash
npm run dev -- --demo
```

## Tests

```bash
npm test
```

## Swap Mock Scheduler For Real EMR

1. Implement a real adapter class in `src/scheduler.ts` that satisfies `SchedulerAdapter`.
2. Wire API auth/base URL from `.env` (`EMR_BASE_URL`, `EMR_API_KEY`).
3. Replace `createSchedulerAdapter()` to instantiate the real adapter when `SCHEDULER_MODE=real`.
4. Keep function signatures stable:
   - `get_clinic_info`
   - `lookup_patient`
   - `get_available_slots`
   - `book_appointment`
   - `reschedule_appointment`
   - `cancel_appointment`
   - `create_new_patient`
   - `log_call_summary`
   - `warm_transfer`
5. Preserve privacy and logging redaction before writing call metadata.

## Compliance/Safety Notes

- Alex always identifies as automated when asked.
- Medical reason is captured only as high-level category.
- No diagnosis/treatment advice is provided.
- Emergency symptom triggers immediate emergency instruction and exits scheduling flow.
- If uncertain or repeated failures occur, Alex defaults to transfer.
