from django.contrib import admin

from .models import (
    BankPayment,
    BankReceivedVoucher,
    CashPayment,
    CashReceivedVoucher,
    CreditNote,
    DebitNote,
    JournalEntry,
    JournalLine,
    MaterialReturned,
    OrderForm,
    PaymentAdjustment,
    SalesInvoice,
)

admin.site.register(OrderForm)
admin.site.register(SalesInvoice)
admin.site.register(BankReceivedVoucher)
admin.site.register(CashReceivedVoucher)
admin.site.register(BankPayment)
admin.site.register(CashPayment)
admin.site.register(JournalEntry)
admin.site.register(JournalLine)
admin.site.register(CreditNote)
admin.site.register(DebitNote)
admin.site.register(MaterialReturned)
admin.site.register(PaymentAdjustment)
