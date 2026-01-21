import { Elysia, t } from "elysia";
import { fsService } from "../services/fs.service";
import { auth } from "../services/auth.service";

export const fsRoutes = new Elysia({ prefix: "/fs" })
  // Auth guard for all FS routes
  .onBeforeHandle(async ({ headers, set }) => {
    const sessionId = auth.parseSessionCookie(headers.cookie);
    const user = await auth.validateSession(sessionId!);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    // Return nothing to continue to handler
  })
  // List directory
  .get(
    "/list",
    async ({ query }) => {
      const path = query.path || "";
      const items = await fsService.list(path);
      return { path, items };
    },
    {
      query: t.Object({
        path: t.Optional(t.String()),
      }),
    }
  )
  // Read file
  .get(
    "/read",
    async ({ query, set }) => {
      try {
        const content = await fsService.read(query.path);
        return { path: query.path, content };
      } catch (err: any) {
        set.status = 404;
        return { error: err.message };
      }
    },
    {
      query: t.Object({
        path: t.String(),
      }),
    }
  )
  // Download file (binary)
  .get(
    "/download",
    async ({ query, set }) => {
      try {
        const file = await fsService.readBinary(query.path);
        const info = await fsService.info(query.path);

        set.headers["content-type"] = info.mimeType;
        set.headers["content-disposition"] =
          `attachment; filename="${info.name}"`;

        return file;
      } catch (err: any) {
        set.status = 404;
        return { error: err.message };
      }
    },
    {
      query: t.Object({
        path: t.String(),
      }),
    }
  )
  // Write file
  .post(
    "/write",
    async ({ body, set }) => {
      try {
        await fsService.write(body.path, body.content);
        return { success: true, path: body.path };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        path: t.String(),
        content: t.String(),
      }),
    }
  )
  // Create directory
  .post(
    "/mkdir",
    async ({ body, set }) => {
      try {
        await fsService.mkdir(body.path);
        return { success: true, path: body.path };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        path: t.String(),
      }),
    }
  )
  // Delete file/directory
  .delete(
    "/delete",
    async ({ query, set }) => {
      try {
        await fsService.delete(query.path);
        return { success: true };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message };
      }
    },
    {
      query: t.Object({
        path: t.String(),
      }),
    }
  )
  // Move/rename
  .post(
    "/move",
    async ({ body, set }) => {
      try {
        await fsService.move(body.source, body.destination);
        return { success: true };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        source: t.String(),
        destination: t.String(),
      }),
    }
  )
  // Copy
  .post(
    "/copy",
    async ({ body, set }) => {
      try {
        await fsService.copy(body.source, body.destination);
        return { success: true };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        source: t.String(),
        destination: t.String(),
      }),
    }
  )
  // Get file info
  .get(
    "/info",
    async ({ query, set }) => {
      try {
        const info = await fsService.info(query.path);
        return info;
      } catch (err: any) {
        set.status = 404;
        return { error: err.message };
      }
    },
    {
      query: t.Object({
        path: t.String(),
      }),
    }
  )
  // Upload file (multipart)
  .post(
    "/upload",
    async ({ body, set }) => {
      try {
        const { file, path } = body;

        if (!file) {
          set.status = 400;
          return { error: "No file provided" };
        }

        const content = await file.arrayBuffer();
        const destPath = path ? `${path}/${file.name}` : file.name;

        await fsService.write(destPath, new Uint8Array(content));

        return { success: true, path: destPath, name: file.name };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        file: t.File(),
        path: t.Optional(t.String()),
      }),
    }
  )
  // Move to Trash with conflict handling
  .post(
    "/trash",
    async ({ body, set }) => {
      try {
        const trashedAs = await fsService.moveToTrash(body.path);
        return { success: true, trashedAs };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        path: t.String(),
      }),
    }
  );
