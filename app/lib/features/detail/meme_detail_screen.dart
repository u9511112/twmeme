import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';

import '../../core/models/meme.dart';
import '../widgets/long_press_menu.dart';

/// Full-screen detail view with pinch-to-zoom for images.
class MemeDetailScreen extends StatelessWidget {
  final Meme meme;
  const MemeDetailScreen({super.key, required this.meme});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        title: Text(meme.platformIcon + ' ' + (meme.title ?? '迷因詳情')),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () => showModalBottomSheet(
              context: context,
              useRootNavigator: true,
              isScrollControlled: true,
              backgroundColor: Theme.of(context).colorScheme.surface,
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              builder: (_) => LongPressMenu(meme: meme),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PhotoView(
                imageProvider: CachedNetworkImageProvider(meme.displayUrl),
                minScale: PhotoViewComputedScale.contained,
                maxScale: PhotoViewComputedScale.covered * 4.0,
                heroAttributes: PhotoViewHeroAttributes(tag: meme.id),
                loadingBuilder: (ctx, event) => const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                ),
                errorBuilder: (_, __, ___) => const Center(
                  child: Icon(Icons.broken_image_rounded,
                      color: Colors.grey, size: 64),
                ),
              ),
            ),
            // Stats bar
            Container(
              color: Colors.black87,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _Stat(Icons.thumb_up_rounded, meme.likeCount),
                  _Stat(Icons.share_rounded, meme.shareCount),
                  _Stat(Icons.comment_rounded, meme.commentCount),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final IconData icon;
  final int count;
  const _Stat(this.icon, this.count);

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, color: Colors.white70, size: 18),
      const SizedBox(width: 4),
      Text(
        count >= 1000 ? '${(count / 1000).toStringAsFixed(1)}k' : '$count',
        style: const TextStyle(color: Colors.white70, fontSize: 13),
      ),
    ],
  );
}
