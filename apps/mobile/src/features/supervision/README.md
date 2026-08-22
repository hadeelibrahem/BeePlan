# BeePlan Guardian native boundary

The current Expo development build does not include an iOS FamilyControls/ManagedSettings module or Android Device Owner integration. The adapter deliberately reports enforcement as unavailable instead of simulating blocking.

An iOS implementation requires a custom native module and Development Build rebuild with FamilyControls, ManagedSettings, and (where scheduled enforcement is required) DeviceActivity entitlements. Opaque Screen Time selections remain local to the supervised device.

Android consumer devices can only report accountability/Usage Access where explicitly granted. Device-owner policy enforcement is unavailable unless the device is legitimately provisioned as managed. No Accessibility service is used.
