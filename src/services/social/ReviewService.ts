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

export const ReviewService = {
  async submitReview(itemId: string, content: string, rating: number, spoiler: boolean = false): Promise<boolean> {
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
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          profiles ( name, avatar ),
          likes:review_likes ( count )
        `)
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return [];

      // If user is logged in, check if they liked each review
      let userLikes: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('review_likes')
          .select('review_id')
          .eq('user_id', user.id);
        userLikes = (likes || []).map(l => l.review_id);
      }

      return data.map(r => ({
        ...r,
        likes_count: r.likes?.[0]?.count || 0,
        is_liked: userLikes.includes(r.id)
      }));
    } catch (e) {
      console.error('Error fetching reviews:', e);
      return [];
    }
  },

  async toggleReviewLike(reviewId: string): Promise<{ success: boolean; liked: boolean }> {
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

