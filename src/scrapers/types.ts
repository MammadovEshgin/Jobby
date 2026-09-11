export interface RawVacancy {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  postedAt?: string;
  description?: string;
}

export interface Scraper {
  name: string;
  fetch(): Promise<RawVacancy[]>;
}
