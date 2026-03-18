/// Meme data model — mirrors the `memes` Supabase table.
class Meme {
  final String id;
  final String platform;
  final String? title;
  final String mediaUrl;      // original CDN URL
  final String? cachedUrl;    // Supabase Storage public URL (preferred)
  final String mediaType;     // 'image' | 'video' | 'gif'
  final int? width;
  final int? height;
  final int likeCount;
  final int shareCount;
  final int commentCount;
  final DateTime fetchedAt;

  const Meme({
    required this.id,
    required this.platform,
    this.title,
    required this.mediaUrl,
    this.cachedUrl,
    required this.mediaType,
    this.width,
    this.height,
    required this.likeCount,
    required this.shareCount,
    required this.commentCount,
    required this.fetchedAt,
  });

  /// Prefer cached (Supabase Storage) URL for reliability; fall back to origin.
  String get displayUrl => cachedUrl ?? mediaUrl;

  bool get isVideo => mediaType == 'video';
  bool get isGif   => mediaType == 'gif';
  bool get isImage => mediaType == 'image';

  /// Emoji badge for platform attribution.
  String get platformIcon => switch (platform) {
    'ptt'       => '🔗',
    'dcard'     => '🃏',
    'threads'   => '🧵',
    'instagram' => '📸',
    _           => '🌐',
  };

  factory Meme.fromJson(Map<String, dynamic> j) => Meme(
    id:           j['id'] as String,
    platform:     j['platform'] as String,
    title:        j['title'] as String?,
    mediaUrl:     j['media_url'] as String,
    cachedUrl:    j['cached_url'] as String?,
    mediaType:    j['media_type'] as String? ?? 'image',
    width:        j['width'] as int?,
    height:       j['height'] as int?,
    likeCount:    j['like_count'] as int? ?? 0,
    shareCount:   j['share_count'] as int? ?? 0,
    commentCount: j['comment_count'] as int? ?? 0,
    fetchedAt:    DateTime.parse(j['fetched_at'] as String),
  );

  /// Aspect ratio for masonry layout; defaults to 4:3 if unknown.
  double get aspectRatio {
    if (width != null && height != null && height! > 0) {
      return width! / height!;
    }
    return 4 / 3;
  }
}
