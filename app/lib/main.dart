import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'features/feed/waterfall_screen.dart';
import 'features/feed/video_feed_screen.dart';

/// Background message handler — must be top-level function.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage msg) async {
  await Firebase.initializeApp();
  debugPrint('Background FCM: ${msg.messageId}');
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ── Supabase ──────────────────────────────────────────────
  await Supabase.initialize(
    url:     const String.fromEnvironment('SUPABASE_URL'),
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
  );

  // ── Firebase FCM ─────────────────────────────────────────
  // Guard: Firebase requires google-services.json (Android) / GoogleService-Info.plist (iOS).
  // Without it the app still runs — FCM features are simply disabled.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    await FirebaseMessaging.instance.requestPermission(
      alert: true, badge: true, sound: true,
    );
    await FirebaseMessaging.instance.subscribeToTopic('all');

    // Listen for foreground notifications
    FirebaseMessaging.onMessage.listen((msg) {
      debugPrint('Foreground FCM: ${msg.notification?.title}');
      // TODO: show in-app snackbar / banner
    });
  } catch (e) {
    debugPrint('Firebase init skipped (no config file): $e');
  }

  // ── System UI ─────────────────────────────────────────────
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  runApp(const ProviderScope(child: MemeMasterApp()));
}

// ─────────────────────────────────────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────────────────────────────────────
class MemeMasterApp extends StatelessWidget {
  const MemeMasterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MemeMaster TW',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system,    // native dark mode
      theme:      _buildTheme(Brightness.light),
      darkTheme:  _buildTheme(Brightness.dark),
      home: const HomeScreen(),
    );
  }

  ThemeData _buildTheme(Brightness brightness) {
    final base = brightness == Brightness.dark
        ? ThemeData.dark(useMaterial3: true)
        : ThemeData.light(useMaterial3: true);

    return base.copyWith(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF6C63FF),
        brightness: brightness,
      ),
      cardTheme: const CardTheme(
        elevation: 0,
        margin: EdgeInsets.zero,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Home — NavigationBar with waterfall + video feed tabs
// ─────────────────────────────────────────────────────────────────────────────
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  static const _screens = [
    WaterfallScreen(),
    VideoFeedScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _selectedIndex == 0
          ? AppBar(
              title: const Text(
                '🇹🇼 MemeMaster',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              centerTitle: false,
            )
          : null,
      body: IndexedStack(
        index: _selectedIndex,
        children: _screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (i) => setState(() => _selectedIndex = i),
        destinations: const [
          NavigationDestination(
            icon:          Icon(Icons.grid_view_rounded),
            selectedIcon:  Icon(Icons.grid_view_rounded),
            label:         '瀑布流',
          ),
          NavigationDestination(
            icon:          Icon(Icons.play_circle_outline_rounded),
            selectedIcon:  Icon(Icons.play_circle_rounded),
            label:         '短影音',
          ),
        ],
      ),
    );
  }
}
