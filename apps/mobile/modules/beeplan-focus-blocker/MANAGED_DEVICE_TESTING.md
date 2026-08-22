# Managed-device hard-blocking test setup

BeePlan can use `DevicePolicyManager.setPackagesSuspended` only after Android reports this app as a **Device Owner** or **Profile Owner**. Enabling supervision consent or the legacy Device Admin receiver alone is not enough.

Development Device Owner provisioning is destructive on most Android versions: it normally requires a clean, unprovisioned device with no user accounts. Do not remove accounts, wipe a device, or run provisioning automatically. Inspect the device first and use a dedicated test device.

After installing the development build whose package is `com.beeplan.app`, the supported ADB command on an eligible clean test device is:

```sh
adb shell dpm set-device-owner com.beeplan.app/com.beeplan.focusblocker.supervision.BeePlanDeviceAdminReceiver
```

Verify before testing:

```sh
adb shell dpm get-device-owner
adb shell dumpsys device_policy
```

Then register the device in BeePlan, confirm the mobile screen reports **Managed-device blocking available**, create a restriction, and verify the target app cannot launch. Complete the linked task or let the server end time expire; foreground/startup reconciliation releases the package. If the device is not provisionable, hard blocking must remain unavailable—do not use overlays, Accessibility, or foreground-app polling as a substitute.
