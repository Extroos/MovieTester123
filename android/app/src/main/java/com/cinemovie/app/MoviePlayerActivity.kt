package com.cinemovie.app

import android.content.Context
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

class MoviePlayerActivity : AppCompatActivity() {

    private lateinit var player: ExoPlayer
    private lateinit var playerView: PlayerView
    private lateinit var audioManager: AudioManager

    private var currentStreamUrl: String = ""
    private var headersJson: JSONObject = JSONObject()
    private var streamQueue: JSONArray = JSONArray()
    private var currentQueueIndex: Int = 0

    private var brightness: Float = 0.5f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState);

        // Immersive full-screen mode
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Force display to keep refresh rate at least at the display's maximum supported rate to prevent ColorOS / aggressive ARR
        // from throttling native ExoPlayer video playback down to 30Hz when no touch interaction is detected.
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            try {
                val display = display
                if (display != null) {
                    val modes = display.supportedModes
                    var maxRate = 60.0f
                    for (mode in modes) {
                        if (mode.refreshRate > maxRate) {
                            maxRate = mode.refreshRate
                        }
                    }
                    val params = window.attributes
                    if (android.os.Build.VERSION.SDK_INT >= 31) {
                        val fieldMin = params.javaClass.getField("preferredMinDisplayRefreshRate")
                        fieldMin.set(params, maxRate)
                        val fieldMax = params.javaClass.getField("preferredMaxDisplayRefreshRate")
                        fieldMax.set(params, maxRate)
                    } else {
                        val field = params.javaClass.getField("preferredFrameRate")
                        field.set(params, maxRate)
                    }
                    window.attributes = params
                    Log.d("MoviePlayerActivity", "Locked display refresh rate to max: $maxRate")
                }
            } catch (e: Exception) {
                Log.w("MoviePlayerActivity", "Failed to lock refresh rate to max: ${e.message}")
            }
        }

        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        brightness = window.attributes.screenBrightness
        if (brightness < 0) brightness = 0.5f

        // Retrieve intent extras
        currentStreamUrl = intent.getStringExtra("source_url") ?: ""
        val headersStr = intent.getStringExtra("headers") ?: "{}"
        headersJson = JSONObject(headersStr)
        val queueStr = intent.getStringExtra("queue") ?: "[]"
        streamQueue = JSONArray(queueStr)

        // Initialize Layout
        val container = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        playerView = PlayerView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        container.addView(playerView)
        setContentView(container)

        setupGestures()
        initializePlayer()
    }

    private fun initializePlayer() {
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .setAllowCrossProtocolRedirects(true)

        // Inject custom headers (Referer, Origin, etc.)
        val headerMap = mutableMapOf<String, String>()
        val keys = headersJson.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            headerMap[key] = headersJson.getString(key)
        }
        httpDataSourceFactory.setDefaultRequestProperties(headerMap)

        val mediaSourceFactory = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(httpDataSourceFactory)

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSourceFactory)
            .build()

        playerView.player = player

        // Start playback
        loadStream(currentStreamUrl)

        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                super.onPlayerError(error)
                Toast.makeText(this@MoviePlayerActivity, "Playback error: ${error.message}", Toast.LENGTH_SHORT).show()
                handleFailover()
            }
        })
    }

    private fun loadStream(url: String) {
        val mediaItem = MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMimeType(if (url.contains(".m3u8")) MimeTypes.APPLICATION_M3U8 else MimeTypes.APPLICATION_MP4)
            .build()
        player.setMediaItem(mediaItem)
        player.prepare()
        player.playWhenReady = true
    }

    private fun handleFailover() {
        if (currentQueueIndex < streamQueue.length() - 1) {
            currentQueueIndex++
            val nextItem = streamQueue.getJSONObject(currentQueueIndex)
            val nextUrl = nextItem.getString("url")
            val nextHeaders = nextItem.optJSONObject("headers") ?: JSONObject()
            
            Toast.makeText(this, "Switching to backup stream...", Toast.LENGTH_SHORT).show()
            
            currentStreamUrl = nextUrl
            headersJson = nextHeaders
            
            player.stop()
            initializePlayer() // Re-initialize player with new source and headers
        } else {
            Toast.makeText(this, "All available streams exhausted.", Toast.LENGTH_LONG).show()
        }
    }

    private fun setupGestures() {
        val gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onScroll(
                e1: MotionEvent?,
                e2: MotionEvent,
                distanceX: Float,
                distanceY: Float
            ): Boolean {
                if (e1 == null) return false
                val width = playerView.width
                val height = playerView.height
                val x = e1.x

                if (abs(distanceY) > abs(distanceX)) {
                    if (x < width / 2) {
                        // Left half: adjust brightness
                        brightness = (brightness + distanceY / height).coerceIn(0.01f, 1.0f)
                        val layoutParams = window.attributes
                        layoutParams.screenBrightness = brightness
                        window.attributes = layoutParams
                    } else {
                        // Right half: adjust volume
                        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                        val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                        val delta = (distanceY / height * maxVolume).toInt()
                        val newVolume = (currentVolume + delta).coerceIn(0, maxVolume)
                        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, newVolume, 0)
                    }
                }
                return true
            }

            override fun onDoubleTap(e: MotionEvent): Boolean {
                val width = playerView.width
                val x = e.x
                if (x < width / 3) {
                    // Double tap left: rewind 10s
                    player.seekTo((player.currentPosition - 10000).coerceAtLeast(0))
                } else if (x > width * 2 / 3) {
                    // Double tap right: forward 10s
                    player.seekTo((player.currentPosition + 10000).coerceAtMost(player.duration))
                }
                return true
            }

            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                if (playerView.isControllerFullyVisible) {
                    playerView.hideController()
                } else {
                    playerView.showController()
                }
                return true
            }
        })

        playerView.setOnTouchListener { _, event ->
            gestureDetector.onTouchEvent(event)
            true
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        player.release()
    }
}
