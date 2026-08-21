import axios from "axios";

const JIKAN_API = "https://api.jikan.moe/v4";
const KITSU_API = "https://kitsu.app/api/edge";

// Gogoanime provider — KEEP THIS
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

export interface LegacyUpcomingResponse extends PaginatedResponse {
  data: NormalizedAnime[];
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

  // --------------------------------------------------
  // KITSU TITLE HELPER
  // --------------------------------------------------

  private getTitle(anime: Record<string, any>) {
    const attributes = anime.attributes || {};
    const titles = attributes.titles || {};

    return {
      english:
        titles.en ||
        attributes.canonicalTitle ||
        anime.title ||
        "",

      romaji:
        titles.en_jp ||
        attributes.canonicalTitle ||
        anime.title ||
        "",

      native:
        titles.ja_jp ||
        titles.ja ||
        attributes.canonicalTitle ||
        anime.title ||
        "",
    };
  }

  // --------------------------------------------------
  // KITSU -> NORMALIZED ANIME
  // --------------------------------------------------

  private convertKitsuAnime(
    anime: Record<string, any>
  ): NormalizedAnime {
    const attributes = anime.attributes || {};
    const poster = attributes.posterImage || {};

    const mapping = attributes.mappings?.find(
      (item: any) =>
        item.externalSite === "myanimelist/anime"
    );

    return {
      id: String(anime.id),

      malId:
        Number(mapping?.externalId) || 0,

      title: this.getTitle(anime),

      image:
        poster.large ||
        poster.medium ||
        poster.small ||
        "",

      description:
        attributes.synopsis ||
        "",

      rating:
        Number(attributes.averageRating) || 0,

      episodeNumber:
        Number(attributes.episodeCount) || 0,

      totalEpisodes:
        Number(attributes.episodeCount) || 0,

      status:
        attributes.status || "",

      type:
        attributes.subtype || "TV",

      year:
        attributes.startDate
          ? new Date(
              attributes.startDate
            ).getFullYear()
          : null,
    };
  }

  // --------------------------------------------------
  // JIKAN -> NORMALIZED ANIME
  // --------------------------------------------------

  private convertJikanAnime(
    anime: Record<string, any>
  ): NormalizedAnime {
    return {
      id:
        anime.mal_id || "",

      malId:
        Number(anime.mal_id) || 0,

      title: {
        english:
          anime.title_english ||
          anime.title ||
          "",

        romaji:
          anime.title ||
          "",

        native:
          anime.title_japanese ||
          anime.title ||
          "",
      },

      image:
        anime.images?.jpg?.large_image_url ||
        anime.images?.jpg?.image_url ||
        anime.images?.jpg?.small_image_url ||
        "",

      description:
        anime.synopsis ||
        "",

      rating:
        Number(anime.score) || 0,

      episodeNumber:
        Number(anime.episodes) || 0,

      totalEpisodes:
        Number(anime.episodes) || 0,

      status:
        anime.status ||
        "",

      type:
        anime.type ||
        "TV",

      year:
        anime.year ||
        (
          anime.aired?.from
            ? new Date(
                anime.aired.from
              ).getFullYear()
            : null
        ),
    };
  }

  // --------------------------------------------------
  // GOGOANIME EPISODES
  // --------------------------------------------------

  async getAnimeEpisodes(
    gogoAnimeId: string
  ) {
    try {
      const response =
        await axios.get(
          `${CONSUMET_API}/info/${encodeURIComponent(
            gogoAnimeId
          )}`
        );

      return response.data?.episodes || [];
    } catch (error) {
      console.error(
        "Failed to fetch Gogoanime episode list:",
        error
      );

      return [];
    }
  }

  // --------------------------------------------------
  // GOGOANIME STREAM DATA
  // --------------------------------------------------

  async getEpisodeStream(
    episodeId: string
  ): Promise<StreamData | null> {
    try {
      const response =
        await axios.get(
          `${CONSUMET_API}/watch/${encodeURIComponent(
            episodeId
          )}`
        );

      const data =
        response.data || {};

      return {
        headers:
          data.headers || {},

        sources:
          Array.isArray(data.sources)
            ? data.sources
            : [],

        download:
          data.download,
      };
    } catch (error) {
      console.error(
        "Failed to fetch streaming links:",
        error
      );

      return null;
    }
  }

  // --------------------------------------------------
  // SEARCH
  // --------------------------------------------------

  async advancedSearch(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse> {
    const page =
      params.page || 1;

    const perPage =
      params.perPage || 25;

    const query =
      params.query || "";

    try {
      // Kitsu search
      if (query.trim()) {
        const response =
          await axios.get(
            `${KITSU_API}/anime`,
            {
              params: {
                "filter[text]":
                  query,

                "page[limit]":
                  perPage,

                "page[offset]":
                  (page - 1) *
                  perPage,

                include:
                  "mappings",
              },
            }
          );

        const results =
          (
            response.data?.data ||
            []
          ).map(
            (anime: any) =>
              this.convertKitsuAnime(
                anime
              )
          );

        const total =
          Number(
            response.data?.meta
              ?.count
          ) ||
          results.length;

        return {
          results,

          hasNextPage:
            results.length >=
            perPage,

          totalPages:
            Math.max(
              1,
              Math.ceil(
                total / perPage
              )
            ),
        };
      }

      // Jikan fallback
      const response =
        await axios.get(
          `${JIKAN_API}/top/anime`,
          {
            params: {
              page,
              limit: perPage,
            },
          }
        );

      const results =
        (
          response.data?.data ||
          []
        ).map(
          (anime: any) =>
            this.convertJikanAnime(
              anime
            )
        );

      return {
        results,

        hasNextPage:
          Boolean(
            response.data
              ?.pagination
              ?.has_next_page
          ),

        totalPages:
          response.data
            ?.pagination
            ?.last_visible_page ||
          page,
      };
    } catch (error) {
      console.error(
        "Anime search failed:",
        error
      );

      return {
        results: [],
        hasNextPage: false,
        totalPages: 0,
      };
    }
  }

  // --------------------------------------------------
  // RANDOM
  // --------------------------------------------------

  async getRandom(): Promise<
    NormalizedAnime | null
  > {
    try {
      const response =
        await axios.get(
          `${JIKAN_API}/random/anime`
        );

      if (!response.data?.data) {
        return null;
      }

      return this.convertJikanAnime(
        response.data.data
      );
    } catch (error) {
      console.error(
        "Random anime failed:",
        error
      );

      return null;
    }
  }

  // --------------------------------------------------
  // TRENDING
  // --------------------------------------------------

  async getTrending(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse> {
    return this.getPopular(params);
  }

  // --------------------------------------------------
  // POPULAR
  // --------------------------------------------------

  async getPopular(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse> {
    try {
      const response =
        await axios.get(
          `${JIKAN_API}/top/anime`,
          {
            params: {
              page:
                params.page || 1,

              limit:
                params.perPage || 20,

              filter:
                "bypopularity",
            },
          }
        );

      const results =
        (
          response.data?.data ||
          []
        ).map(
          (anime: any) =>
            this.convertJikanAnime(
              anime
            )
        );

      return {
        results,

        hasNextPage:
          Boolean(
            response.data
              ?.pagination
              ?.has_next_page
          ),

        totalPages:
          response.data
            ?.pagination
            ?.last_visible_page,
      };
    } catch (error) {
      console.error(
        "Popular anime failed:",
        error
      );

      return {
        results: [],
        hasNextPage: false,
      };
    }
  }

  // --------------------------------------------------
  // RECENT ANIME
  // --------------------------------------------------

  async getRecentEpisodes(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse> {
    try {
      const response =
        await axios.get(
          `${KITSU_API}/anime`,
          {
            params: {
              sort:
                "-updatedAt",

              "page[limit]":
                params.perPage || 15,

              include:
                "mappings",
            },
          }
        );

      const results =
        (
          response.data?.data ||
          []
        ).map(
          (anime: any) =>
            this.convertKitsuAnime(
              anime
            )
        );

      return {
        results,

        hasNextPage: false,
      };
    } catch (error) {
      console.error(
        "Recent anime failed:",
        error
      );

      return {
        results: [],
        hasNextPage: false,
      };
    }
  }

  // --------------------------------------------------
  // UPCOMING
  //
  // IMPORTANT:
  // Upcoming.tsx uses:
  //
  // data.data
  //
  // Therefore this method returns BOTH
  // "results" and "data".
  // --------------------------------------------------

  async getUpcomingAnimes(
    params: PaginationParams = {}
  ): Promise<LegacyUpcomingResponse> {
    try {
      const response =
        await axios.get(
          `${JIKAN_API}/top/anime`,
          {
            params: {
              filter:
                "upcoming",

              page:
                params.page || 1,

              limit:
                params.limit ||
                params.perPage ||
                25,
            },
          }
        );

      const results =
        (
          response.data?.data ||
          []
        ).map(
          (anime: any) =>
            this.convertJikanAnime(
              anime
            )
        );

      return {
        results,

        // Required by Upcoming.tsx
        data: results,

        hasNextPage:
          Boolean(
            response.data
              ?.pagination
              ?.has_next_page
          ),

        totalPages:
          response.data
            ?.pagination
            ?.last_visible_page ||
          1,
      };
    } catch (error) {
      console.error(
        "Upcoming anime failed:",
        error
      );

      return {
        results: [],

        data: [],

        hasNextPage: false,

        totalPages: 0,
      };
    }
  }
}

// --------------------------------------------------
// DEFAULT API INSTANCE
// GOGOANIME IS THE DEFAULT PROVIDER
// --------------------------------------------------

export const animeApi =
  new AnimeApi("GOGO");
