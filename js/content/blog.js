/* Posts for the `blog` command, which opens them in a full-screen pager.
 * `src` is fetched from the site root, the files live in posts/ next to index.html.
 * `title` is also the post's address: /blog/<title>. Keep posts/ and /blog/ apart, or the raw file would shadow the page.
 * The post list shows them in this order. The command only exists while this list has entries. */

export const BLOG = [
    { title: 'blog-1.md', src: 'posts/blog-1.md' },
    { title: 'blog-2.md', src: 'posts/blog-2.md' },
];
