# Invoice Ninja v1 evaluation

Selected bounded native fetch against Invoice Ninja5.13.43, commit382020072bc79e8c7ede49f7e9ce91b0aeb1a051. This independent module uses the starter's existing Jobs and Webhooks capabilities without a new worker or server framework. Provider financial state stays authoritative; the starter owns trusted bindings and private durable intent/receipts.

Pinned primary sources:
- [Release](https://github.com/invoiceninja/invoiceninja/releases/tag/v5.13.43)
- [Invoice input](https://github.com/invoiceninja/invoiceninja/blob/v5.13.43/app/Http/Requests/Invoice/StoreInvoiceRequest.php)
- [Native sender](https://github.com/invoiceninja/invoiceninja/blob/v5.13.43/app/Jobs/Util/WebhookSingle.php): configured possession header, no body signature or event timestamp
- [Draft factory](https://github.com/invoiceninja/invoiceninja/blob/v5.13.43/app/Factory/InvoiceFactory.php): draft balance starts at zero
- [Mark-sent transition](https://github.com/invoiceninja/invoiceninja/blob/v5.13.43/app/Services/Invoice/MarkSent.php): adds outstanding balance; explicitly outside this module's write scope

The actual-provider fixture pins the official5.13.43 multi-architecture image by digest, asserts its version, seeds a disposable company/client with no gateways/subscriptions, and uses an internal Docker network. Node24 runs the module's transport in that network namespace. Numeric-string quantity/cost, exact amount and zero draft balance, draft/unsent status and no email/payment side effects are checked through API and DB. No remote callback registration, financial certification, production account or credential creation is implied.

Mocked loopback protocol/real PostgreSQL fixtures additionally exercise failures that do not belong in external systems. Runtime/lifecycle/native/browser/production gates must all pass on the final implementation before marking done; partial evidence is not acceptance.
