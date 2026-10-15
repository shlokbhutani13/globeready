import { reviewedUniversities } from "../../client/src/data/university-coverage.js";
import { validateUniversityRegistry } from "../../client/src/lib/university-registry.js";

const result = validateUniversityRegistry(reviewedUniversities);
if (!result.valid) {
  console.error(result.errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`University coverage is valid (${reviewedUniversities.length} reviewed entries).`);
}
