import axios from "axios";

const JIKAN_API = "https://api.jikan.moe/v4";
const KITSU_API = "https://kitsu.app/api/edge";

const AnimeProviders = {
  ANIMEPAHE: "animepahe",
  GOGO: "gogoanime",
  ZORO: "zoro",
  ENIME: "enime",
  CRUNCHYROLL: "crunchyroll",
};

export type AnimeProvider = keyof typeof AnimeProviders;

export class AnimeApi {
  provider: string;

  constructor(provider: AnimeProvider = "GOGO") {
    this.provider = AnimeProviders[provider];
  }

  private title(anime: any) {
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

  private kitsuAnime(anime: any) {
    const attributes = anime.attributes || {};
    const poster = attributes.posterImage || {};

    return {
      id: anime.id,
      malId: attributes.mappings?.find(
        (m: any) => m.externalSite === "myanimelist/anime"
      )?.externalId || 0,

      title: this.title(anime),

      image:
        poster.large ||
        poster.medium ||
        poster.small ||
        "",

      description: attributes.synopsis || "",

      rating: Number(attributes.averageRating || 0),

      episodeNumber:
        attributes.episodeCount ||
        0,

      totalEpisodes:
        attributes.episodeCount ||
        0,

      status: attributes.status || "",

      type: attributes.subtype || "TV",

      year:
        attributes.startDate
          ? new Date(attributes.startDate).getFullYear()
          : null,
    };
  }

  private jikanAnime(anime: any) {
    return {
      id: anime.mal_id,

      malId: anime.mal_id,

      title: {
        english: anime.title_english || anime.title || "",
        romaji: anime.title || "",
        native: anime.title_japanese || anime.title || "",
      },

      image:
        anime.images?.jpg?.large_image_url ||
        anime.images?.jpg?.image_url ||
        "",

      description: anime.synopsis || "",

      rating: anime.score || 0,

      episodeNumber: anime.episodes || 0,

      totalEpisodes: anime.episodes || 0,

      status: anime.status || "",

      type: anime.type || "TV",

      year: anime.year || null,
    };
  }

  async advancedSearch(params: any = {}) {
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
          },
        });

        const results = (response.data.data || []).map((anime: any) =>
          this.kitsuAnime(anime)
        );

        const total =
          response.data.meta?.count || results.length;

        return {
          results,
          hasNextPage: results.length === perPage,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
        };
      }

      const response = await axios.get(`${JIKAN_API}/top/anime`, {
        params: {
          page,
          limit: perPage,
        },
      });

      const results = (response.data.data || []).map((anime: any) =>
        this.jikanAnime(anime)
      );

      return {
        results,
        hasNextPage: Boolean(response.data.pagination?.has_next_page),
        totalPages:
          response.data.pagination?.last_visible_page || page,
      };
    } catch (error) {
      console.error("Anime search failed:", error);

      return {
        results: [],
        hasNextPage: false,
        totalPages: 0,
      };
    }
  }

  async getRandom(params: any = {}) {
    try {
      const response = await axios.get(`${JIKAN_API}/random/anime`);

      return this.jikanAnime(response.data.data);
    } catch (error) {
      console.error("Random anime failed:", error);
      return null;
    }
  }

  async getTrending(params: any = {}) {
    try {
      const response = await axios.get(`${JIKAN_API}/top/anime`, {
        params: {
          page: 1,
          limit: params.perPage || 20,
          filter: "bypopularity",
        },
      });

      return {
        results: (response.data.data || []).map((anime: any) =>
          this.jikanAnime(anime)
        ),
        hasNextPage: Boolean(response.data.pagination?.has_next_page),
      };
    } catch (error) {
      console.error("Trending anime failed:", error);

      return {
        results: [],
        hasNextPage: false,
      };
    }
  }

  async getPopular(params: any = {}) {
    try {
      const response = await axios.get(`${JIKAN_API}/top/anime`, {
        params: {
          page: params.page || 1,
          limit: params.perPage || 20,
          filter: "bypopularity",
        },
      });

      return {
        results: (response.data.data || []).map((anime: any) =>
          this.jikanAnime(anime)
        ),
        hasNextPage: Boolean(response.data.pagination?.has_next_page),
      };
    } catch (error) {
      console.error("Popular anime failed:", error);

      return {
        results: [],
        hasNextPage: false,
      };
    }
  }

  async getRecentEpisodes(params: any = {}) {
    try {
      const response = await axios.get(`${KITSU_API}/anime`, {
        params: {
          sort: "-updatedAt",
          "page[limit]": params.perPage || 15,
        },
      });

      return {
        results: (response.data.data || []).map((anime: any) =>
          this.kitsuAnime(anime)
        ),
        hasNextPage: false,
      };
    } catch (error) {
      console.error("Recent anime failed:", error);

      return {
        results: [],
        hasNextPage: false,
      };
    }
  }

  async getUpcomingAnimes(params: any = {}) {
    try {
      const response = await axios.get(`${JIKAN_API}/top/anime`, {
        params: {
          filter: "upcoming",
          page: params.page || 1,
        },
      });

      return {
        results: (response.data.data || []).map((anime: any) =>
          this.jikanAnime(anime)
        ),
        hasNextPage: Boolean(response.data.pagination?.has_next_page),
      };
    } catch (error) {
      console.error("Upcoming anime failed:", error);

      return {
        results: [],
        hasNextPage: false,
      };
    }
  }
}

export const animeApi = new AnimeApi();
