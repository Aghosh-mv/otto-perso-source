// @ts-nocheck — React Native app; compiles in the otto-mobile RN project
// (own tsconfig + node_modules), not the Next.js app build.
/**
 * Otto Perso — React Native App
 * 
 * This is the REAL Android app. It bundles Node.js inside the APK using
 * nodejs-mobile-react-native. When the app launches:
 * 1. Node.js starts inside the app process
 * 2. The Next.js server boots on port 3000
 * 3. A WebView loads http://localhost:3000
 * 4. The user sees Otto in a native Android window
 * 
 * Unlike the old WebView APK, this one has the actual server running
 * INSIDE the app. No external server needed. Works offline.
 */

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  StatusBar,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import NodeJS from 'nodejs-mobile-react-native';

// Cross-device Lok: set REMOTE_URL to a shared hosted Otto backend
// (e.g. 'https://otto.yourhost.com') to join your account across phone + laptop.
// When set, the app skips the bundled nodejs-mobile server and loads the shared
// backend — so chats, Lok, agents, and vault are the SAME on every device.
// Leave empty for the offline-capable single-device bundle.
const REMOTE_URL = ''; // ← set your hosted Otto URL here (or via react-native-config)
const SERVER_URL = REMOTE_URL || 'http://localhost:3000';
const USE_REMOTE = !!REMOTE_URL;

export default function App() {
  const [serverReady, setServerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Start the Node.js server inside the app
    startServer();
  }, []);

  const startServer = async () => {
    try {
      // Remote mode: skip the bundled nodejs-mobile server, just poll the shared backend.
      if (USE_REMOTE) {
        const checkInterval = setInterval(async () => {
          try {
            const response = await fetch(`${SERVER_URL}/login`, { method: 'HEAD' });
            if (response.ok || response.status === 302) {
              clearInterval(checkInterval);
              setServerReady(true);
            }
          } catch {
            // backend not reachable yet
          }
        }, 1000);
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!serverReady) {
            setError('Cannot reach the Otto backend. Check your connection / REMOTE_URL.');
          }
        }, 30000);
        return;
      }

      // Local mode: start the Node.js server inside the app
      await NodeJS.start('main.js');

      // Wait for the server to be ready
      const checkInterval = setInterval(async () => {
        try {
          const response = await fetch(`${SERVER_URL}/login`, {
            method: 'HEAD',
          });
          if (response.ok || response.status === 302) {
            clearInterval(checkInterval);
            setServerReady(true);
          }
        } catch {
          // Server not ready yet, keep polling
        }
      }, 1000);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!serverReady) {
          setError('Server took too long to start. Please restart the app.');
        }
      }, 30000);
    } catch (e) {
      setError(`Failed to start server: ${e}`);
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!serverReady) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar backgroundColor="#FAFAF9" barStyle="dark-content" />
        <View style={styles.loading}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>O</Text>
          </View>
          <Text style={styles.title}>Otto Perso</Text>
          <Text style={styles.subtitle}>Starting up...</Text>
          <ActivityIndicator size="large" color="#0A0A0A" style={styles.spinner} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FAFAF9" barStyle="dark-content" />
      <WebView
        source={{ uri: SERVER_URL }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        onMessage={(event) => {
          // Handle messages from the web app
          console.log('WebView message:', event.nativeEvent.data);
        }}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#0A0A0A" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF9',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FAFAF9',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 64,
    height: 64,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0A0A0A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#737373',
    marginBottom: 24,
  },
  spinner: {
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    padding: 24,
  },
});
