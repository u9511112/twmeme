import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/meme.dart';

const _pageSize = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client provider
// ─────────────────────────────────────────────────────────────────────────────
final supabaseClientProvider = Provider<SupabaseClient>(
  (ref) => Supabase.instance.client,
);

// ─────────────────────────────────────────────────────────────────────────────
// Platform filter  (null = show all)
// ─────────────────────────────────────────────────────────────────────────────
final platformFilterProvider = StateProvider<String?>((ref) => null);

// ─────────────────────────────────────────────────────────────────────────────
// Meme list with infinite scroll
// ─────────────────────────────────────────────────────────────────────────────
class MemeListNotifier extends AsyncNotifier<List<Meme>> {
  int _offset = 0;
  bool _hasMore = true;

  @override
  Future<List<Meme>> build() async {
    // Reset when platform filter changes
    ref.watch(platformFilterProvider);
    _offset  = 0;
    _hasMore = true;
    return _fetch();
  }

  Future<List<Meme>> _fetch() async {
    final sb     = ref.read(supabaseClientProvider);
    final filter = ref.read(platformFilterProvider);

    var query = sb
        .from('memes')
        .select()
        .order('fetched_at', ascending: false)
        .range(_offset, _offset + _pageSize - 1);

    if (filter != null) {
      query = query.eq('platform', filter);
    }

    final data = await query;
    final memes = (data as List).map((j) => Meme.fromJson(j)).toList();

    _hasMore = memes.length == _pageSize;
    _offset += memes.length;
    return memes;
  }

  Future<void> loadMore() async {
    if (!_hasMore || state is AsyncLoading) return;
    final current = state.value ?? [];
    final more    = await _fetch();
    state = AsyncData([...current, ...more]);
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    _offset  = 0;
    _hasMore = true;
    state = AsyncData(await _fetch());
  }
}

final memeListProvider =
    AsyncNotifierProvider<MemeListNotifier, List<Meme>>(MemeListNotifier.new);

// ─────────────────────────────────────────────────────────────────────────────
// Video-only list derived from meme list
// ─────────────────────────────────────────────────────────────────────────────
final videoListProvider = Provider<AsyncValue<List<Meme>>>((ref) {
  return ref.watch(memeListProvider).whenData(
    (memes) => memes.where((m) => m.isVideo).toList(),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Trending memes (for badge / highlight)
// ─────────────────────────────────────────────────────────────────────────────
final trendingMemesProvider = FutureProvider<List<Meme>>((ref) async {
  final sb = ref.read(supabaseClientProvider);
  final data = await sb
      .from('memes')
      .select()
      .order('trending_score', ascending: false)
      .limit(10);
  return (data as List).map((j) => Meme.fromJson(j)).toList();
});
