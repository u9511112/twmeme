import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../core/models/meme.dart';
import 'long_press_menu.dart';

/// Masonry grid card — handles images, GIFs, and video thumbnails.
class MemeCard extends StatefulWidget {
  final Meme meme;
  const MemeCard({super.key, required this.meme});

  @override
  State<MemeCard> createState() => _MemeCardState();
}

class _MemeCardState extends State<MemeCard> {
  bool _liked = false;

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

  void _onLikeTap() {
    HapticFeedback.lightImpact();          // subtle haptic on heart
    setState(() => _liked = !_liked);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: _onLongPress,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          children: [
            // ── Media ────────────────────────────────────────────────────
            _buildMedia(),

            // ── Video indicator ──────────────────────────────────────────
            if (widget.meme.isVideo)
              const Positioned(
                top: 8, left: 8,
                child: _VideoChip(),
              ),

            // ── Platform badge ───────────────────────────────────────────
            Positioned(
              top: 8, right: 8,
              child: _PlatformBadge(meme: widget.meme),
            ),

            // ── Like button ──────────────────────────────────────────────
            Positioned(
              bottom: 8, right: 8,
              child: GestureDetector(
                onTap: _onLikeTap,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  transitionBuilder: (child, anim) =>
                      ScaleTransition(scale: anim, child: child),
                  child: Icon(
                    _liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                    key: ValueKey(_liked),
                    color: _liked ? Colors.red : Colors.white,
                    size: 26,
                    shadows: const [Shadow(blurRadius: 6, color: Colors.black54)],
                  ),
                ),
              ),
            ),

            // ── Like count ───────────────────────────────────────────────
            if (widget.meme.likeCount > 0)
              Positioned(
                bottom: 8, left: 8,
                child: _LikeCountBadge(count: widget.meme.likeCount),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildMedia() {
    return CachedNetworkImage(
      imageUrl: widget.meme.displayUrl,
      fit: BoxFit.cover,
      width: double.infinity,
      fadeInDuration: const Duration(milliseconds: 200),
      placeholder: (ctx, _) => Container(
        height: 160,
        decoration: BoxDecoration(
          color: Theme.of(ctx).colorScheme.surfaceVariant,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      errorWidget: (_, __, ___) => Container(
        height: 160,
        color: Colors.grey[800],
        child: const Center(
          child: Icon(Icons.broken_image_rounded, color: Colors.grey, size: 40),
        ),
      ),
    );
  }
}

class _VideoChip extends StatelessWidget {
  const _VideoChip();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      color: Colors.black54,
      borderRadius: BorderRadius.circular(6),
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.play_arrow_rounded, color: Colors.white, size: 14),
        SizedBox(width: 2),
        Text('影片', style: TextStyle(color: Colors.white, fontSize: 11)),
      ],
    ),
  );
}

class _PlatformBadge extends StatelessWidget {
  final Meme meme;
  const _PlatformBadge({required this.meme});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
    decoration: BoxDecoration(
      color: Colors.black45,
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(
      meme.platformIcon,
      style: const TextStyle(fontSize: 13),
    ),
  );
}

class _LikeCountBadge extends StatelessWidget {
  final int count;
  const _LikeCountBadge({required this.count});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      color: Colors.black45,
      borderRadius: BorderRadius.circular(6),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.thumb_up_rounded, color: Colors.white70, size: 11),
        const SizedBox(width: 3),
        Text(
          _formatCount(count),
          style: const TextStyle(color: Colors.white, fontSize: 11),
        ),
      ],
    ),
  );

  String _formatCount(int n) {
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return '$n';
  }
}
