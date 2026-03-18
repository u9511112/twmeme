import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:image_gallery_saver/image_gallery_saver.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

import '../../core/models/meme.dart';

/// Bottom sheet quick-action menu shown on long-press of any meme card.
class LongPressMenu extends StatelessWidget {
  final Meme meme;
  const LongPressMenu({super.key, required this.meme});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Center(
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 8),
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[400],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          if (meme.title != null) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(
                meme.title!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
            const Divider(),
          ],
          _MenuItem(
            icon: Icons.download_rounded,
            label: '下載',
            onTap: () => _download(context),
          ),
          _MenuItem(
            icon: Icons.share_rounded,
            label: '分享',
            onTap: () => _share(context),
          ),
          _MenuItem(
            icon: Icons.open_in_browser_rounded,
            label: '開啟原文',
            onTap: () => _openSource(context),
          ),
          _MenuItem(
            icon: Icons.copy_rounded,
            label: '複製連結',
            onTap: () => _copyLink(context),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Future<void> _download(BuildContext ctx) async {
    Navigator.pop(ctx);
    try {
      final file = await DefaultCacheManager().getSingleFile(meme.displayUrl);
      final result = await ImageGallerySaver.saveFile(file.path);
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(
            content: Text(
              result['isSuccess'] == true ? '已儲存到相簿 ✓' : '儲存失敗，請確認相簿權限',
            ),
          ),
        );
      }
    } catch (e) {
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(content: Text('下載失敗：$e')),
        );
      }
    }
  }

  Future<void> _share(BuildContext ctx) async {
    Navigator.pop(ctx);
    try {
      final file  = await DefaultCacheManager().getSingleFile(meme.displayUrl);
      final xfile = XFile(file.path);
      await Share.shareXFiles([xfile], text: meme.title ?? '台灣迷因');
    } catch (e) {
      // Fallback: share URL
      await Share.share(meme.displayUrl, subject: meme.title ?? '台灣迷因');
    }
  }

  void _openSource(BuildContext ctx) {
    Navigator.pop(ctx);
    // Launch URL (requires url_launcher or user to copy)
    _copyLink(ctx, url: meme.mediaUrl, message: '已複製原始連結');
  }

  void _copyLink(BuildContext ctx, {String? url, String? message}) {
    Navigator.pop(ctx);
    Clipboard.setData(ClipboardData(text: url ?? meme.displayUrl));
    ScaffoldMessenger.of(ctx).showSnackBar(
      SnackBar(content: Text(message ?? '已複製連結 ✓')),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _MenuItem({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
      title: Text(label),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }
}
