// src/app/discord-login.tsx
import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DiscordLoginModal() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Script to inject on page load. It scans localStorage, tries standard iFrame bypass, 
  // and scans webpack chunks. Once found, it posts the token back to RN.
  const tokenScraperJs = `
    (function() {
        function cleanToken(t) {
            if (!t) return null;
            try {
                var s = String(t);
                if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
                    s = s.slice(1, -1);
                }
                return s;
            } catch (e) { return null; }
        }

        function send(t) {
            var s = cleanToken(t);
            if (s && s !== "null" && s !== "error" && s.length >= 25) {
                window.ReactNativeWebView.postMessage(s);
                return true;
            }
            return false;
        }

        function tryLocalStorage() {
            try {
                return send(window.localStorage.getItem("token") || window.localStorage.token);
            } catch (e) { return false; }
        }

        function tryIframe() {
            try {
                var i = document.createElement('iframe');
                i.style.display = 'none';
                document.body.appendChild(i);
                var alt = i.contentWindow.localStorage.token || i.contentWindow.localStorage.getItem("token");
                i.remove();
                return send(alt);
            } catch (e) { return false; }
        }

        function tryWebpack() {
            try {
                var w = window.webpackChunkdiscord_app;
                if (!w || !w.push) return false;
                var token = null;
                w.push([[Math.random()], {}, function(req) {
                    try {
                        for (var k in req.c) {
                            var m = req.c[k];
                            var exp = m && m.exports && m.exports.default;
                            if (exp && typeof exp.getToken === "function") {
                                token = exp.getToken();
                                break;
                            }
                        }
                    } catch (e) {}
                }]);
                return send(token);
            } catch (e) { return false; }
        }

        function run() {
            if (tryLocalStorage()) return;
            if (tryWebpack()) return;
            tryIframe();
        }

        run();
        // Periodically run in case of redirection delay
        setTimeout(run, 1200);
        setTimeout(run, 3000);
        setTimeout(run, 6000);
    })();
    true; // note: injected script must end with a true/void value or it might fail on iOS
  `;

  const handleMessage = async (event: any) => {
    const token = event.nativeEvent.data;
    if (token && token.trim().length >= 25) {
      console.log('DiscordLogin: Token captured successfully');
      try {
        await AsyncStorage.setItem('@joyflix_discord_token', token.trim());
        router.back();
      } catch (e) {
        console.error('Failed to save Discord token:', e);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sign In with Discord</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* WebView */}
      <View style={styles.webViewContainer}>
        <WebView
          source={{ uri: 'https://discord.com/login' }}
          injectedJavaScript={tokenScraperJs}
          onMessage={handleMessage}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          style={{ flex: 1, backgroundColor: '#000' }}
          userAgent="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        />

        {loading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#a855f7" />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    backgroundColor: '#0c0c0e',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
