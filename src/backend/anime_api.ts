import axios from "axios";

const JIKAN_API = "https://api.jikan.moe/v4";
const KITSU_API = "https://kitsu.app/api/edge";
const CONSUMET_API = "https://api.consumet.org/anime/gogoanime";

export const AnimeProviders = {
  ANIMEPAHE: "animepahe",
  GOGO: "gogoanime",
  ZORO: "zoro",
  ENIME: "enime",
  CRUNCHYROLL: "crunchyroll",
} as const;

export type AnimeProvider = keyof typeof AnimeProviders;

export interface StreamingSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
}

export interface StreamData {
  headers?: Record<string, string>;
  sources: StreamingSource[];
  download?: string;
}

export interface NormalizedAnime {
  id: string | number;
  malId: number;
  title: {
    english: string;
    romaji: string;
    native: string;
  };
  image: string;
  description: string;
  rating: number;
  episodeNumber: number;
  totalEpisodes: number;
  status: string;
  type: string;
  year: number | null;
}

export interface PaginatedResponse {
  results: NormalizedAnime[];
  hasNextPage: boolean;
  totalPages?: number;
}

export interface PaginationParams {
  page?: number;
  perPage?: number;
  query?: string;
  limit?: number;
}

export class AnimeApi {
  provider: string;

  constructor(provider: AnimeProvider = "GOGO") {
    this.provider = AnimeProviders[provider];
  }

  private getTitle(anime: Record<string, any>) {
    const attributes = anime.attributes || {};
    const titles = attributes.titles || {};

    return {
      english: titles.en || attributes.canonicalTitle || anime.title || "",
      romaji: titles.en_jp || attributes.canonicalTitle || anime.title || "",
      native: titles.ja_jp || titles.ja || attributes.canonicalTitle || anime.title || "",
    };
  }

  private convertKitsuAnime(anime: Record<string, any>): NormalizedAnime {
    const attributes = anime.attributes || {};
    const poster = attributes.posterImage || {};

    return {
      id: String(anime.id),
      malId:
        attributes.mappings?.find(
          (mapping: any) => mapping.externalSite === "myanimelist/anime"
        )?.externalId || 0,
      title: this.getTitle(anime),
      image: poster.large || poster.medium || poster.small || "",
      description: attributes.synopsis || "",
      rating: Number(attributes.averageRating || 0),
      episodeNumber: attributes.episodeCount || 0,
      totalEpisodes: attributes.episodeCount || 0,
      status: attributes.status || "",
      type: attributes.subtype || "TV",
      year: attributes.startDate ? new Date(attributes.startDate).getFullYear() : null,
    };
  }

  private convertJikanAnime(anime: Record<string, any>): NormalizedAnime {
    return {
      id: anime.mal_id,
      malId: anime.mal_id,
      title: {
        english: anime.title_english || anime.title || "",
        romaji: anime.title || "",
        native: anime.title_japanese || anime.title || "",
      },
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || "",
      description: anime.synopsis || "",
      rating: anime.score || 0,
      episodeNumber: anime.episodes || 0,
      totalEpisodes: anime.episodes || 0,
      status: anime.status || "",
      type: anime.type || "TV",
      year: anime.year || (anime.aired?.from ? new Date(anime.aired.from).getFullYear() : null),
    };
  }

  /**
   * Fetches episode list directly for a Gogoanime ID (e.g. "naruto")
   */
  async getAnimeEpisodes(gogoAnimeId: string) {
    try {
      const response = await axios.get(`${CONSUMET_API}/info/${gogoAnimeId}`);
      return response.data.episodes || [];
    } catch (error) {
      console.error("Failed to fetch Gogoanime episode list:", error);
      return [];
    }
  }

  /**
   * Fetches HLS (.m3u8) video sources and resolutions for a specific episode ID
   * @param episodeId e.g. "naruto-episode-1"
   */
  async getEpisodeStream(episodeId: string): Promise<StreamData | null> {
    try {
      const response = await axios.get(`${CONSUMET_API}/watch/${episodeId}`);
      return response.data as StreamData;
    } catch (error) {
      console.error("Failed to fetch streaming links:", error);
      return null;
    }
  }

  async advancedSearch(params: PaginationParams = {}): Promise<PaginatedResponse> {
    const page = params.page || 1;
    const perPage = params.perPage || 25;
    const query = params.query || "";

    try {
      if (query) {
        const response = await axios.get(`${KITSU_API}/anime`, {
          params: {
            "filter[text]": query,
            "page[limit]": perPage,
            "page[offset]": (page - 1) * perPage,
            include: "mappings",
          },
        });

        const results = (response.data.data || []).map((anime: any) =>
          this.convertKitsuAnime(anime)
        );
        const total = response.data.meta?.count || results.length;

        return {
          results,
          hasNextPage: results.length === perPage,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
        };
      }

      const response = await axios.get(`${JIKAN_API}/top/anime`, {
        params: { page, limit: perPage },
      });

      return {
        results: (response.data.data || []).map((anime: any) => this.convertJikanAnime(anime)),
        hasNextPage: Boolean(response.data.pagination?.has_next_page),
        totalPages: response.data.pagination?.last_visible_page || page,
      };
    } catch (error) {
      console.error("Anime search failed:", error);
      return { results: [], hasNextPage: false, totalPages: 0 };
    }
  }

  async getRandom(): Promise<NormalizedAnime | null> {
    try {
      const response = await axios.get(`${JIKAN_API}/random/anime`);
      return this.convertJikanAnime(response.data.data);
    } catch (error) {
      console.error("Random anime failed:", error);
      return null;
    }
  }

  async getTrending(params: PaginationParams = {}): Promise<PaginatedResponse> {
    return this.getPopular(params);
  }

  async getPopular(params: PaginationParams = {}): Promise<PaginatedResponse> {
    try {
      const response = await axios.get(`${JIKAN_API}/top/anime`, {
        params: {
          page: params.page || 1,
          limit: params.perPage || 20,
          filter: "bypopularity",
        },
      });

      return {
        results: (response.data.data || []).map((anime: any) => this.convertJikanAnime(anime)),
        hasNextPage: Boolean(response.data.pagination?.has_next_page),
      };
    } catch (error) {
      console.error("Popular anime failed:", error);
      return { results: [], hasNextPage: false };
    }
  }

  async getRecentEpisodes(params: PaginationParams = {}): Promise<PaginatedResponse> {
    try {
      const response = await axios.get(`${KITSU_API}/anime`, {
        params: {
          sort: "-updatedAt",
          "page[limit]": params.perPage || 15,
        },
      });

      return {
        results: (response.data.data || []).map((anime: any) => this.convertKitsuAnime(anime)),
        hasNextPage: false,
      };
    } catch (error) {
      console.error("Recent anime failed:", error);
      return { results: [], hasNextPage: false };
    }
  }

  async getUpcomingAnimes(params: PaginationParams = {}): Promise<PaginatedResponse> {
    try {
      const response = await axios.get(`${JIKAN_API}/top/anime`, {
        params: {
          filter: "upcoming",
          page: params.page || 1,
          limit: params.limit || params.perPage || 25,
        },
      });

      return {
        results: (response.data.data || []).map((anime: any) => this.convertJikanAnime(anime)),
        hasNextPage: Boolean(response.data.pagination?.has_next_page),
        totalPages: response.data.pagination?.last_visible_page || 1,
      };
    } catch (error) {
      console.error("Upcoming anime failed:", error);
      return { results: [], hasNextPage: false, totalPages: 0 };
    }
  }
}

export const animeApi = new AnimeApi();
