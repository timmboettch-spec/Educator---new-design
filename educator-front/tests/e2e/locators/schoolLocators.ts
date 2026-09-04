export const schoolLocators = {
  schoolsLink: 'a[href="/schools"], a:has-text("Schools")',
  addSchoolButton: 'button:has-text("Add School"):not([type="submit"]), button:has-text("Add School")[class*="bg-gradient"]',
  schoolNameInput: 'input[name="school_name"]',
  // <button class="inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-white transition-colors disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 px-4 py-2 w-1/2 h-11 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium" type="submit" form="school-form">Add School</button>

  submitButton: 'button[type="submit"][form="school-form"]:has-text("Add School"), button[type="submit"]:has-text("Add School"), button[type="submit"]:has-text("Update School"), button[type="submit"]:has-text("Update")',
  statusDropdown: 'button:has-text("Active")',
  schoolListText: 'text=ABC School',
  searchInput: 'input[placeholder="Search..."]',
  viewIcon: 'svg.lucide-eye',
  backButton: 'button:has-text("Back")',
  editIcon: 'svg.lucide-square-pen',
  deleteTrigger: 'button[aria-label="delete"], button:has-text("Delete"), button:has(svg.lucide-trash), button:has(svg.lucide-trash-2), svg.lucide-trash, svg.lucide-trash-2',
  inactiveOption: 'div[class*="cursor-pointer"]:has-text("Inactive")',
  // const filterButton = page.locator('button').filter({
//   has: page.locator('svg.lucide-funnel')
// });
  filericon: 'button:has(svg.lucide-funnel)',
  // filter text const filterSchoolsText = page.getByText('Filter Schools');\
  filterSchoolsText: 'text=Filter Schools',
  
  // 

  filterstatusDropdown: 'button:has-text("Select Status")',
  // filterscholllist <button type="button" class="w-full h-[38px] px-3 rounded-xl bg-white text-sm outline-none transition-all flex items-center justify-between border-2 border-orange-400"><span class="text-gray-400">Select School</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-500 transition-transform duration-200 rotate-180"><path d="M6 9l6 6 6-6"></path></svg></button>
  filterscholllist: 'button:has-text("Select School")',

  // <button class="px-5 py-2 rounded-full text-sm font-medium bg-orange-500 text-white">Apply Filter</button>
  applyFilterButton: 'button:has-text("Apply Filter")',

  // <button class="px-5 py-2 rounded-full text-sm font-medium bg-gray-300 text-gray-700">Reset Filter</button>
  resetFilterButton: 'button:has-text("Reset Filter")'

};