from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_account_bill_budget_category_recurringtransaction_and_more'),
    ]

    operations = [
        migrations.DeleteModel(
            name='RecurringTransaction',
        ),
    ]
