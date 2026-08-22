package com.beeplan.focusblocker.supervision

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

data class PackageOperationResult(val requested: List<String>, val succeeded: List<String>, val failed: List<String>, val capability: String) {
  fun toMap() = mapOf("requested" to requested, "succeeded" to succeeded, "failed" to failed, "capability" to capability, "enforced" to (requested.isNotEmpty() && failed.isEmpty()))
}

/** The sole native boundary for actual Guardian package suspension. */
class ManagedPackageController(private val context: Context) {
  private val policy = context.getSystemService(DevicePolicyManager::class.java)
  private val admin = ComponentName(context, BeePlanDeviceAdminReceiver::class.java)

  fun capability(): String = when {
    policy.isDeviceOwnerApp(context.packageName) -> "device_owner"
    policy.isProfileOwnerApp(context.packageName) -> "profile_owner"
    else -> "accountability_only"
  }

  fun hardBlockingAvailable() = capability() == "device_owner" || capability() == "profile_owner"

  fun suspend(packages: List<String>, suspended: Boolean): PackageOperationResult {
    val requested = packages.map(String::trim).filter { it.isNotEmpty() }.distinct()
    val safe = requested.filterNot(::isProtected)
    val rejected = requested - safe.toSet()
    if (!hardBlockingAvailable()) return PackageOperationResult(requested, emptyList(), requested, capability())
    if (safe.isEmpty()) return PackageOperationResult(requested, emptyList(), rejected, capability())
    val unsatisfied = try { policy.setPackagesSuspended(admin, safe.toTypedArray(), suspended).toSet() } catch (_: SecurityException) { safe.toSet() } catch (_: IllegalArgumentException) { safe.toSet() }
    val verified = safe.filter { isSuspended(it) == suspended && it !in unsatisfied }
    return PackageOperationResult(requested, verified, (safe - verified.toSet()) + rejected, capability())
  }

  fun suspended(packages: List<String>) = packages.distinct().associateWith(::isSuspended)

  /** Reconciles the union of all server-active rules; stale BeePlan suspensions are always released. */
  fun reconcile(desiredPackages: List<String>): Map<String, Any> {
    val preferences = context.getSharedPreferences("beeplan_managed_packages", Context.MODE_PRIVATE)
    val previous = preferences.getStringSet("packages", emptySet()) ?: emptySet()
    val desired = desiredPackages.map(String::trim).filter { it.isNotEmpty() }.toSet()
    val release = suspend((previous - desired).toList(), false)
    val apply = suspend(desired.toList(), true)
    val confirmed = desired.filter(::isSuspended).toSet()
    preferences.edit().putStringSet("packages", confirmed).apply()
    return mapOf("requested" to desired.toList(), "suspended" to confirmed.toList(), "released" to release.succeeded, "failed" to apply.failed, "capability" to capability(), "state" to when { desired.isEmpty() -> "released"; apply.failed.isEmpty() && confirmed == desired -> "enforced"; confirmed.isNotEmpty() -> "partially_enforced"; else -> "failed" })
  }

  private fun isSuspended(packageName: String): Boolean = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) context.packageManager.isPackageSuspended(packageName) else false
  } catch (_: PackageManager.NameNotFoundException) { false }

  private fun isProtected(packageName: String): Boolean {
    if (packageName == context.packageName || packageName == "com.android.systemui" || packageName == "com.android.packageinstaller" || packageName == "com.google.android.permissioncontroller") return true
    val launcher = context.packageManager.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
    return packageName == launcher || packageName.startsWith("com.android.server") || packageName.startsWith("android")
  }
}
