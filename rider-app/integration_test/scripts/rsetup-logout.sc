# Off camera: make sure the sign-in screen is showing.
if key:conn-status tap "icon:person_rounded#last" 1
if icon:account_balance_wallet_rounded scroll 900
if key:sign-out tap key:sign-out 1
until key:rider-email 20
