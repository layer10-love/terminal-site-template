/* Every post has its own address, /blog/<title>, so it can be linked to and survives a reload.
 * The server has to answer those paths with index.html; Terminal.route() opens the post. */
export const BLOG_ROUTE = '/blog';
export const isBlogPath = (pathname) => /^\/blog(\/|$)/.test(pathname);
