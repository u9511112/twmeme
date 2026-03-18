import 'package:cached_video_player_plus/cached_video_player_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/meme.dart';
import '../../core/providers/meme_provider.dart';
import '../widgets/long_press_menu.dart';

/// TikTok-style vertical paging video feed.
///
/// - Muted autoplay on enter, pause on leave
/// - Seamless looping
/// - Tap to toggle mute
/// - Long-press for action menu (haptic)
/// - Pre-initializes next video for smooth transitions
class VideoFeedScreen extends ConsumerStatefulWidget {
  const VideoFeedScreen({super.key});

  @override
  ConsumerState<VideoFeedScreen> createState() => _VideoFeedScreenState();
}

class _VideoFeedScreenState extends ConsumerState<VideoFeedScreen> {
  final _pageController = PageController();
  final Map<int, CachedVideoPlayerPlusController> _controllers = {};
  int _currentIndex = 0;

  @override
  void dispose() {
    _pageController.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  List<Meme> _getVideos() {
    return ref.read(videoListProvider).value ?? [];
  }

  Future<CachedVideoPlayerPlusController> _initController(
      String url) async {
    final ctrl = CachedVideoPlayerPlusController.networkUrl(
      Uri.parse(url),
      invalidateCacheIfOlderThan: const Duration(days: 7),
    );
    await ctrl.initialize();
    ctrl
      ..setLooping(true)
      ..setVolume(0)    // muted autoplay (platform policy + UX)
      ..play();
    return ctrl;
  }

  void _onPageChanged(int index) {
    // Pause previous
    _controllers[_currentIndex]?.pause();
    // Play new
    _controllers[index]?.play();
    setState(() => _currentIndex = index);

    // Pre-init next+1
    final videos = _getVideos();
    if (index + 1 < videos.length) {
      _controllers.putIfAbsent(
        index + 1,
        () => _initController(videos[index + 1].displayUrl)
            as CachedVideoPlayerPlusController,
      );
    }

    // Load more from server when near end
    if (index >= videos.length - 3) {
      ref.read(memeListProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ref.watch(videoListProvider).when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('載入失敗：$e')),
      data: (videos) {
        if (videos.isEmpty) {
          return const Center(
            child: Text('目前沒有影片迷因 🎬'),
          );
        }
        return PageView.builder(
          controller: _pageController,
          scrollDirection: Axis.vertical,
          itemCount: videos.length,
          onPageChanged: _onPageChanged,
          itemBuilder: (ctx, i) {
            final meme = videos[i];
            return _VideoPage(
              key: ValueKey(meme.id),
              meme: meme,
              controllerFuture: _controllers.putIfAbsent(
                i,
                () => _initController(meme.displayUrl),
              ),
            );
          },
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single video page
// ─────────────────────────────────────────────────────────────────────────────
class _VideoPage extends StatefulWidget {
  final Meme meme;
  final Future<CachedVideoPlayerPlusController> controllerFuture;

  const _VideoPage({
    super.key,
    required this.meme,
    required this.controllerFuture,
  });

  @override
  State<_VideoPage> createState() => _VideoPageState();
}

class _VideoPageState extends State<_VideoPage> {
  bool _muted  = true;
  bool _liked  = false;

  void _toggleMute(CachedVideoPlayerPlusController ctrl) {
    setState(() => _muted = !_muted);
    ctrl.setVolume(_muted ? 0 : 1);
  }

  void _onLongPress() {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => LongPressMenu(meme: widget.meme),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<CachedVideoPlayerPlusController>(
      future: widget.controllerFuture,
      builder: (ctx, snap) {
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final ctrl = snap.data!;
        return GestureDetector(
          onTap: () => _toggleMute(ctrl),
          onLongPress: _onLongPress,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // ── Video ─────────────────────────────────────────
              FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width:  ctrl.value.size.width,
                  height: ctrl.value.size.height,
                  child: VideoPlayer(ctrl),
                ),
              ),

              // ── Bottom gradient + info ─────────────────────────
              Positioned(
                bottom: 0, left: 0, right: 0,
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end:   Alignment.topCenter,
                      colors: [Colors.black87, Colors.transparent],
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(16, 40, 16, 32),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              widget.meme.platformIcon +
                                  ' ' + (widget.meme.title ?? ''),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),

                      // ── Right action column ────────────────────
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _ActionBtn(
                            icon: _liked
                                ? Icons.favorite_rounded
                                : Icons.favorite_border_rounded,
                            color: _liked ? Colors.red : Colors.white,
                            label: _formatCount(widget.meme.likeCount),
                            onTap: () {
                              HapticFeedback.lightImpact();
                              setState(() => _liked = !_liked);
                            },
                          ),
                          const SizedBox(height: 16),
                          _ActionBtn(
                            icon: _muted
                                ? Icons.volume_off_rounded
                                : Icons.volume_up_rounded,
                            label: _muted ? '靜音' : '聲音',
                            onTap: () => _toggleMute(ctrl),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatCount(int n) {
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return '$n';
  }
}

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  const _ActionBtn({
    required this.icon,
    this.color = Colors.white,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Column(
      children: [
        Icon(icon, color: color, size: 32,
            shadows: const [Shadow(blurRadius: 4, color: Colors.black54)]),
        const SizedBox(height: 4),
        Text(label,
            style: const TextStyle(
                color: Colors.white, fontSize: 12,
                shadows: [Shadow(blurRadius: 3, color: Colors.black54)])),
      ],
    ),
  );
}
