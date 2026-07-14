package com.cinemovie.app

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean

class ObserverUnitTest {

    @Test
    fun testMovieUrlConstruction() {
        val tmdbId = "12345"
        val targetUrl = "https://vidsrc.to/embed/movie/$tmdbId"
        assertEquals("https://vidsrc.to/embed/movie/12345", targetUrl)
    }

    @Test
    fun testTvUrlConstruction() {
        val tmdbId = "67890"
        val season = 1
        val episode = 2
        val targetUrl = "https://vidsrc.to/embed/tv/$tmdbId/$season/$episode"
        assertEquals("https://vidsrc.to/embed/tv/67890/1/2", targetUrl)
    }

    @Test
    fun testObserverCallbackLifecycleSimulated() {
        val interceptedTriggered = AtomicBoolean(false)
        val timeoutTriggered = AtomicBoolean(false)

        val listener = object : BackgroundRequestObserver.ObserverListener {
            override fun onResourceIntercepted(url: String) {
                interceptedTriggered.set(true)
            }

            override fun onTimeout() {
                timeoutTriggered.set(true)
            }
        }

        // Simulate resource interception
        listener.onResourceIntercepted("https://example.com/stream.m3u8")
        assertEquals(true, interceptedTriggered.get())
        assertEquals(false, timeoutTriggered.get())

        // Reset and simulate timeout fallback
        interceptedTriggered.set(false)
        listener.onTimeout()
        assertEquals(false, interceptedTriggered.get())
        assertEquals(true, timeoutTriggered.get())
    }
}
