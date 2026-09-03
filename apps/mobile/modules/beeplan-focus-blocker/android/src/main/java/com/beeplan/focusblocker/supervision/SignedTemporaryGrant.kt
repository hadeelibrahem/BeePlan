package com.beeplan.focusblocker.supervision

import android.content.Context
import android.util.Base64
import com.beeplan.focusblocker.BuildConfig
import org.json.JSONObject
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

data class SignedTemporaryGrant(val grantId: String, val requestId: String, val userId: String, val packageName: String, val issuedAt: Long, val expiresAt: Long, val decisionSource: String, val nonce: String)

/** Verifies server RSA-SHA256 grants. The bridge never supplies authority fields separately. */
object SignedTemporaryGrantVerifier {
  private const val MAX_LIFETIME_MS = 15 * 60 * 1000L
  fun verify(token: String, expectedUserId: String, now: Long = System.currentTimeMillis()): SignedTemporaryGrant? = runCatching {
    val parts = token.split('.'); require(parts.size == 2 && expectedUserId.isNotBlank())
    val body = parts[0]; val signature = Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    val pem = BuildConfig.SUPERVISION_GRANT_PUBLIC_KEY_PEM.replace("\\n", "\n"); require(pem.isNotBlank())
    val keyBytes = Base64.decode(pem.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace(Regex("\\s"), ""), Base64.DEFAULT)
    val verifier = Signature.getInstance("SHA256withRSA"); verifier.initVerify(KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(keyBytes))); verifier.update(body.toByteArray(Charsets.UTF_8)); require(verifier.verify(signature))
    val json = JSONObject(String(Base64.decode(body, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING), Charsets.UTF_8)); val issuedAt = json.getLong("issuedAt"); val expiresAt = json.getLong("expiresAt"); val version = json.getInt("version")
    require(version == 1 || version == 2)
    val grantUserId = if (version == 2) json.getString("userId") else json.getString("supervisedUserId")
    require(grantUserId == expectedUserId && json.getString("packageName").isNotBlank() && json.getString("grantId").isNotBlank() && json.getString("requestId").isNotBlank() && json.getString("nonce").isNotBlank())
    if (version == 2) require(json.getString("decisionSource") == "ai")
    require(issuedAt <= now + 60_000 && expiresAt > now && expiresAt > issuedAt && expiresAt - issuedAt <= MAX_LIFETIME_MS)
    SignedTemporaryGrant(json.getString("grantId"), json.getString("requestId"), grantUserId, json.getString("packageName"), issuedAt, expiresAt, json.getString("decisionSource"), json.getString("nonce"))
  }.getOrNull()
}

class SignedGrantStore(context: Context) {
  private val prefs = context.getSharedPreferences("beeplan.signed_temporary_grants", Context.MODE_PRIVATE)
  fun save(token: String, userId: String) { prefs.edit().putString("grant", token).putString("userId", userId).apply() }
  fun load() = prefs.getString("grant", null)
  fun userId() = prefs.getString("userId", null)
  fun clear() { prefs.edit().remove("grant").remove("userId").apply() }
}
