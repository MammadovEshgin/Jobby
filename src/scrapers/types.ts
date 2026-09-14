export interface RawVacancy {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  postedAt?: string;
}

export interface Scraper {
  name: string;
  fetch(): Promise<RawVacancy[]>;
}
