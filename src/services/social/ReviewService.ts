import { supabase } from '../../lib/supabase';

export interface Review {
  id: string;
  user_id: string;
  item_id: string;
  content: string;
  rating: number;
  spoiler: boolean;
  created_at: string;
  profiles?: {
    name: string;
    avatar: string;
  };
  likes_count: number;
  is_liked: boolean;
}

const isGuest = () => localStorage.getItem('cinemovie_is_guest') === 'true';

export const ReviewService = {
  async submitReview(itemId: string, content: string, rating: number, spoiler: boolean = false): Promise<boolean> {
    if (isGuest()) {
      alert('Review submission requires a signed-in account. Please register or log in.');
      return false;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('reviews')
        .insert({
          user_id: user.id,
          item_id: itemId,
          content,
          rating,
          spoiler
        });

      if (error) throw error;

      // Also update or insert into ratings table for quick aggregation
      await this.submitRating(itemId, rating);

      return true;
    } catch (e) {
      console.error('Error submitting review:', e);
      return false;
    }
  },

  async submitRating(itemId: string, rating: number): Promise<boolean> {
    if (isGuest()) {
      return false;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('ratings')
        .upsert({
          user_id: user.id,
          item_id: itemId,
          rating
        }, { onConflict: 'user_id,item_id' });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Error submitting rating:', e);
      return false;
    }
  },

  async getReviews(itemId: string): Promise<Review[]> {
    try {
      const { data: { user } } = isGuest() ? { data: { user: null } } : await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          likes:review_likes ( count )
        `)
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return [];

      const userIds = Array.from(new Set(data.map(r => r.user_id).filter(Boolean)));
      const profilesMap: Record<string, { name: string; avatar: string }> = {};

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, name, avatar')
          .in('user_id', userIds);

        if (profilesData) {
          // Sort profiles so that profiles with custom names (not default CineMovie User / cinemovie User) come first
          const sortedProfiles = [...profilesData].sort((a, b) => {
            const aIsDefault = !a.name || a.name.toLowerCase() === 'cinemovie user' || a.name.toLowerCase() === 'guest';
            const bIsDefault = !b.name || b.name.toLowerCase() === 'cinemovie user' || b.name.toLowerCase() === 'guest';
            if (aIsDefault && !bIsDefault) return 1;
            if (!aIsDefault && bIsDefault) return -1;
            return 0;
          });

          sortedProfiles.forEach(p => {
            if (p.user_id && !profilesMap[p.user_id]) {
              profilesMap[p.user_id] = {
                name: p.name,
                avatar: p.avatar
              };
            }
          });
        }
      }

      // If user is logged in, check if they liked each review
      let userLikes: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('review_likes')
          .select('review_id')
          .eq('user_id', user.id);
        userLikes = (likes || []).map(l => l.review_id);
      }

      // Fetch active profile cache if it exists
      let activeProfile: any = null;
      try {
        const cached = localStorage.getItem('watchmovie_active_profile_cache');
        if (cached) {
          activeProfile = JSON.parse(cached);
        }
      } catch (e) {}

      return data.map(r => {
        let prof = profilesMap[r.user_id] || { name: 'CineMovie User', avatar: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png' };
        
        // If this review belongs to the current logged-in user, use their active profile name/avatar
        if (user && r.user_id === user.id && activeProfile) {
          prof = {
            name: activeProfile.name || prof.name,
            avatar: activeProfile.avatar || prof.avatar
          };
        }

        // Clean up case variations of default name
        if (prof.name && prof.name.toLowerCase() === 'cinemovie user') {
          if (user && r.user_id === user.id && activeProfile) {
            prof.name = activeProfile.name || 'CineMovie User';
            prof.avatar = activeProfile.avatar || prof.avatar;
          } else {
            prof.name = 'CineMovie User';
          }
        }

        return {
          ...r,
          profiles: prof,
          likes_count: r.likes?.[0]?.count || 0,
          is_liked: userLikes.includes(r.id)
        };
      });
    } catch (e) {
      console.error('Error fetching reviews:', e);
      return [];
    }
  },

  async toggleReviewLike(reviewId: string): Promise<{ success: boolean; liked: boolean }> {
    if (isGuest()) {
      alert('Liking reviews requires a signed-in account.');
      return { success: false, liked: false };
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, liked: false };

      const { data: existing } = await supabase
        .from('review_likes')
        .select('id')
        .eq('review_id', reviewId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('review_likes')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
        return { success: true, liked: false };
      } else {
        const { error } = await supabase
          .from('review_likes')
          .insert({
            user_id: user.id,
            review_id: reviewId
          });
        if (error) throw error;
        return { success: true, liked: true };
      }
    } catch (e) {
      console.error('Error toggling review like:', e);
      return { success: false, liked: false };
    }
  },

  async getAverageRating(itemId: string): Promise<{ average: number; count: number }> {
    try {
      const { data, error } = await supabase
        .from('ratings')
        .select('rating')
        .eq('item_id', itemId);

      if (error) throw error;
      if (!data || data.length === 0) return { average: 0, count: 0 };

      const sum = data.reduce((acc, curr) => acc + curr.rating, 0);
      return {
        average: parseFloat((sum / data.length).toFixed(1)),
        count: data.length
      };
    } catch (e) {
      console.error('Error fetching average rating:', e);
      return { average: 0, count: 0 };
    }
  }
};
