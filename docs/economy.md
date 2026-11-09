# Economy, services and loans

Credits are earned and spent through effects (`add_credits`), so every change is an event and nothing is special-cased (ECO-1: jobs, favours, scavenging and selling information are just dialogue or pickup effects that add credits).

## Services (`content/services/*.json`)
```json
{ "id": "transit_fare", "name": "Transit fare", "description": "...", "price": 5,
  "legitimate": true, "once": false, "requires": [], "effects": [{ "set_flag": ["has_ticket", true] }],
  "successText": "...", "refusals": { "null_state": "..." } }
```
Using one (`{use_service: id}`, or `{service:ID}` in `.qdl`) checks, in this order: it exists; a `legitimate` service is refused to the **null state** (no passes at all, ECO-3); a `once` service has not already been used; `requires` (the shared condition language) holds; the player can pay. Only then is the price charged and the effects applied. Each refusal has a specific line (`refusals`, with defaults), emitted as `ServiceRefused` and shown in the dialogue window as a notice. A success shows `successText`.

Forging, borrowing or bribing any pass (origin `forged`, `borrowed`, `stolen`) puts the player on record, which opens legitimate services. That is the intended loop: the null state is safe from the city's anger but shut out of its counters.

In dialogue: `can:ID` (usable now), `record` / `!record` (any identity on file), `debt:LENDER` (or `debt:*`), effects `service:ID`, `loan:LENDER*N`, `repay:LENDER*N`.

## Loans
`take_loan [lender, amount]` pays out credits and records a debt. Each in-game day interest compounds (`economy.loanInterestPerDay`, rounded up). After `economy.loanDueDays`, collectors come every day: they take `economy.garnishFraction` of the credits carried (never more than is owed) and raise the alert to at least Suspicious (`CollectorsCame`). `repay_loan` pays up to the amount given, limited by what is owed and carried. The HUD shows what you owe.

## Not yet
The clinic (augment repair), fences with changing prices, transit as actual travel, bribe-able officials as characters and the reintegration office as a place arrive with their districts (M3/M4). Their *mechanics* are services and fit in the data above.
