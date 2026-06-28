package com.cinemovie.app

import android.content.Context
import android.util.Base64
import android.util.Log
import app.cash.quickjs.QuickJs
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

interface DecryptHelper {
    fun nativeDecryptAes(cipher: String, k1: String, k2: String): String
}

class JsPluginEngine(private val context: Context) {

    fun runExtractor(pluginName: String, htmlOrCipher: String, urlOrKeys: String): String {
        val quickJs = QuickJs.create()
        try {
            val scriptContent = context.assets.open("plugins/$pluginName.js").bufferedReader().use { it.readText() }
            
            val helper = object : DecryptHelper {
                override fun nativeDecryptAes(cipher: String, k1: String, k2: String): String {
                    return decryptAesHelper(cipher, k1, k2)
                }
            }
            
            quickJs.set("nativeHelper", DecryptHelper::class.java, helper)
            
            quickJs.evaluate("function nativeDecryptAes(cipher, k1, k2) { return nativeHelper.nativeDecryptAes(cipher, k1, k2); }")
            
            quickJs.evaluate(scriptContent)
            
            val callScript = "extract(${escapeJsString(htmlOrCipher)}, ${escapeJsString(urlOrKeys)});"
            val result = quickJs.evaluate(callScript)
            return (result as? String) ?: ""
        } catch (e: Exception) {
            Log.e("JsPluginEngine", "Failed to run extractor $pluginName", e)
            return "{\"error\":\"${e.message}\"}"
        } finally {
            quickJs.close()
        }
    }

    private fun decryptAesHelper(cipherText: String, keyStr: String, ivStr: String): String {
        return try {
            val keyBytes = keyStr.toByteArray(Charsets.UTF_8)
            val ivBytes = ivStr.toByteArray(Charsets.UTF_8)
            val cipherBytes = Base64.decode(cipherText, Base64.DEFAULT)
            
            val keySpec = SecretKeySpec(keyBytes, "AES")
            val ivSpec = IvParameterSpec(ivBytes)
            
            val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
            cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec)
            
            val decryptedBytes = cipher.doFinal(cipherBytes)
            String(decryptedBytes, Charsets.UTF_8)
        } catch (e: Exception) {
            "Decryption error: ${e.message}"
        }
    }

    private fun escapeJsString(str: String): String {
        val escaped = str.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        return "\"$escaped\""
    }
}
