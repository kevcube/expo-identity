package expo.modules.identity

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.credentials.CredentialManager
import androidx.credentials.DigitalCredential
import androidx.credentials.ExperimentalDigitalCredentialApi
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetDigitalCredentialOption
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.provider.SigningInfoCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalDigitalCredentialApi::class)
class ExpoIdentityModule : Module() {
  @Volatile
  private var requestActive = false

  override fun definition() = ModuleDefinition {
    Name("ExpoIdentity")

    AsyncFunction("getCapabilities") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
        promise.reject("UNAVAILABLE", "Digital Credentials require Android 9 or later.", null)
        return@AsyncFunction
      }
      try {
        promise.resolve(
          mapOf(
            "protocols" to listOf("openid4vp-v1-signed", "openid4vp-v1-unsigned"),
            "origin" to appOrigin(appContext.reactContext!!)
          )
        )
      } catch (error: Exception) {
        promise.reject("UNAVAILABLE", "Could not determine the app signing origin.", error)
      }
    }

    AsyncFunction("present") { requestJson: String, promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
        promise.reject("UNAVAILABLE", "Digital Credentials require Android 9 or later.", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("UNAVAILABLE", "An Android activity is required to present a credential.", null)
        return@AsyncFunction
      }
      synchronized(this@ExpoIdentityModule) {
        if (requestActive) {
          promise.reject("REQUEST_IN_PROGRESS", "An identity request is already in progress.", null)
          return@AsyncFunction
        }
        requestActive = true
      }

      CoroutineScope(Dispatchers.Main).launch {
        try {
          val protocolRequest = JSONObject(requestJson)
          val protocol = protocolRequest.getString("protocol")
          if (protocol != "openid4vp-v1-signed" && protocol != "openid4vp-v1-unsigned") {
            throw IllegalArgumentException("Unsupported Android identity protocol")
          }
          protocolRequest.getJSONObject("data")
          val credentialManagerRequest = JSONObject()
            .put("requests", JSONArray().put(protocolRequest))
            .toString()
          val response = CredentialManager.create(activity).getCredential(
            activity,
            GetCredentialRequest(
              listOf(GetDigitalCredentialOption(credentialManagerRequest))
            )
          )
          val credential = response.credential
          if (credential !is DigitalCredential) {
            promise.reject("INVALID_RESPONSE", "The wallet did not return a digital credential.", null)
            return@launch
          }
          promise.resolve(credential.credentialJson)
        } catch (error: Exception) {
          reject(promise, error)
        } finally {
          requestActive = false
        }
      }
    }
  }

  private fun appOrigin(context: Context): String {
    val packageInfo = context.packageManager.getPackageInfo(
      context.packageName,
      PackageManager.GET_SIGNING_CERTIFICATES
    )
    val signingInfo = SigningInfoCompat.fromSigningInfo(requireNotNull(packageInfo.signingInfo))
    val certificate = signingInfo.signingCertificateHistory.first().toByteArray()
    val digest = MessageDigest.getInstance("SHA-256").digest(certificate)
    val encoded = Base64.encodeToString(digest, Base64.NO_WRAP or Base64.NO_PADDING)
    return "android:apk-key-hash:$encoded"
  }

  private fun reject(promise: Promise, error: Exception) {
    when (error) {
      is GetCredentialCancellationException ->
        promise.reject("CANCELLED", "Identity presentation was cancelled.", error)
      is NoCredentialException ->
        promise.reject("UNAVAILABLE", "No eligible identity document is available.", error)
      is GetCredentialInterruptedException ->
        promise.reject("CANCELLED", "Identity presentation was interrupted.", error)
      is GetCredentialProviderConfigurationException,
      is GetCredentialUnsupportedException ->
        promise.reject("UNAVAILABLE", "No digital credential provider is available.", error)
      is IllegalArgumentException ->
        promise.reject("INVALID_REQUEST", error.message ?: "The identity request is invalid.", error)
      else ->
        promise.reject("UNAVAILABLE", "The wallet could not present a digital credential.", error)
    }
  }
}
