import type {Boat} from '../../src/models';
export interface CatalogPage {total:number;lastPage:number;boats:Boat[]}
export interface CatalogResult {boats:Boat[];pages:number;total:number;listedCards:number;duplicates:number;conflicts:number}
export const CATALOG_URL:string;
export function parseCatalogPage(html:string,page?:number):CatalogPage;
export function validateCatalogPage(value:unknown,page:number):CatalogPage;
export function collectCatalog(readPage:(page:number)=>Promise<string>,onProgress?:(page:number,total:number)=>void):Promise<CatalogResult>;
export function collectCatalogPages(readPage:(page:number)=>Promise<CatalogPage>,onProgress?:(page:number,total:number)=>void):Promise<CatalogResult>;
export function mergePublishedFleet(previous:Boat[],incoming:Boat[]):Boat[];
