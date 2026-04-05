import { sampleShow } from "@rehearsal-block/core";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  return {
    show: sampleShow,
  };
};
