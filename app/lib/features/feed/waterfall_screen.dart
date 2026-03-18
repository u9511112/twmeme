import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../core/models/meme.dart';
import '../../core/providers/meme_provider.dart';
import '../widgets/meme_card.dart';

/// Waterfall (masonry) grid feed.
/// Supports infinite scroll, pull-to-refresh, and platform filter chips.
class WaterfallScreen extends ConsumerStatefulWidget {
  const WaterfallScreen({super.key});

  @override
  ConsumerState<WaterfallScreen> createState() => _WaterfallScreenState();
}

class _WaterfallScreenState extends ConsumerState<WaterfallScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 400) {
      ref.read(memeListProvider.notifier).loadMore();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _PlatformFilterBar(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.read(memeListProvider.notifier).refresh(),
            child: _buildGrid(),
          ),
        ),
      ],
    );
  }

  Widget _buildGrid() {
    final memesAsync = ref.watch(memeListProvider);
    return memesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 48, color: Colors.grey),
            const SizedBox(height: 8),
            Text('載入失敗：$e', textAlign: TextAlign.center),
            TextButton(
              onPressed: () => ref.invalidate(memeListProvider),
              child: const Text('重試'),
            ),
          ],
        ),
      ),
      data: (memes) {
        if (memes.isEmpty) {
          return const Center(
            child: Text('目前沒有迷因，稍後再來 🥲'),
          );
        }
        return MasonryGridView.count(
          controller: _scrollController,
          crossAxisCount: 2,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          padding: const EdgeInsets.all(8),
          itemCount: memes.length,
          itemBuilder: (ctx, i) => MemeCard(meme: memes[i]),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform filter chips
// ─────────────────────────────────────────────────────────────────────────────
class _PlatformFilterBar extends ConsumerWidget {
  static const _platforms = [
    (null, '全部'),
    ('ptt', 'PTT'),
    ('dcard', 'Dcard'),
    ('threads', 'Threads'),
    ('instagram', 'IG'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(platformFilterProvider);
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        children: _platforms.map((entry) {
          final (value, label) = entry;
          final selected = current == value;
          return Padding(
            padding: const EdgeInsets.only(right: 6, top: 8, bottom: 8),
            child: FilterChip(
              label: Text(label),
              selected: selected,
              onSelected: (_) =>
                  ref.read(platformFilterProvider.notifier).state = value,
            ),
          );
        }).toList(),
      ),
    );
  }
}
